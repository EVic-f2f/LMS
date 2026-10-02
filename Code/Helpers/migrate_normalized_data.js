const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function legacyIdToUuid(value) {
  const digest = require('crypto').createHash('md5').update(String(value)).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function failIfError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data || [];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSchoolMembershipRole(status) {
  const roleMap = {
    Student: 'student',
    Teacher: 'teacher',
    'School Administrator': 'school_admin',
    Administrator: 'administrator',
    Admin: 'administrator'
  };
  return roleMap[String(status || '')] || null;
}

async function verifyColumns(table, columns) {
  const { error } = await supabase.from(table).select(columns.join(',')).limit(0);
  if (error) throw new Error(`Schema preflight failed for ${table}: ${error.message}`);
}

async function verifySchema() {
  const contracts = {
    users: ['id', 'auth_user_id', 'email', 'name', 'status', 'school_id', 'enrolledClasses', 'taughtClasses'],
    schools: ['id', 'config_json'],
    school_settings: ['school_id', 'location', 'grade_fields', 'api_endpoint'],
    school_themes: ['school_id', 'primary_color', 'secondary_color', 'accent_color', 'success_color', 'warning_color', 'background_color', 'text_color'],
    school_memberships: ['user_id', 'school_id', 'role', 'status'],
    school_join_requests: ['id', 'user_id', 'school_id', 'status', 'reviewed_by'],
    classes: ['id', 'school_id', 'name', 'subject', 'created_by', 'created_at'],
    class_members: ['class_id', 'user_id', 'role', 'joined_at'],
    classwork: ['id', 'class_id', 'title', 'description', 'due_at', 'created_by'],
    grades: ['id', 'classwork_id', 'student_id', 'score', 'updated_at'],
    files: ['id', 'school_id', 'class_id', 'uploaded_by', 'filename', 'storage_path', 'created_at'],
    global_settings: ['key', 'value', 'updated_at']
  };
  for (const [table, columns] of Object.entries(contracts)) {
    await verifyColumns(table, columns);
  }
}

function uniqueRows(rows, keyOf) {
  return [...new Map(rows.map((row) => [keyOf(row), row])).values()];
}

function resolveClassSchoolId(classInfo, fallbackSchoolId) {
  const directValue = classInfo && (classInfo.school_id || classInfo.schoolId || classInfo.schoolID || classInfo.school);
  if (directValue) return String(directValue);
  return fallbackSchoolId ? String(fallbackSchoolId) : null;
}

async function migrate() {
  await verifySchema();
  const users = failIfError(await supabase.from('users').select('id,auth_user_id,email,name,status,school_id,enrolledClasses,taughtClasses'), 'Reading users');
  const schools = failIfError(await supabase.from('schools').select('id,config_json'), 'Reading schools');

  const schoolsById = new Map(schools.map((school) => [String(school.id), school]));
  const usersByEmail = new Map(users.map((user) => [String(user.email).toLowerCase(), user]));
  const memberships = [];
  const classes = new Map();
  const classMembers = [];
  const pendingEnrollments = [];
  const settings = [];
  const themes = [];
  const joinRequests = [];
  const classwork = [];
  const grades = [];
  const storedFiles = [];
  const storageFilesPath = path.join(__dirname, '..', '..', 'Storage', 'files');

  for (const school of schools) {
    const config = school.config_json && typeof school.config_json === 'object' ? school.config_json : {};
    settings.push({
      school_id: school.id,
      location: config.location || null,
      grade_fields: config.gradeFields || [],
      api_endpoint: config.apiEndpoint || null
    });
    const theme = config.theme || {};
    themes.push({
      school_id: school.id,
      primary_color: theme.primary || null,
      secondary_color: theme.secondary || null,
      accent_color: theme.accent || null,
      success_color: theme.success || null,
      warning_color: theme.warning || null,
      background_color: theme.background || null,
      text_color: theme.text || null
    });
    for (const request of asArray(config.joinRequests)) {
      const requester = usersByEmail.get(String(request.email || '').toLowerCase());
      if (!requester) continue;
      const requestStatus = ['pending', 'accepted', 'rejected', 'cancelled'].includes(request.status)
        ? request.status
        : 'pending';
      joinRequests.push({
        user_id: requester.id,
        school_id: school.id,
        status: requestStatus,
        reviewed_by: request.reviewedByEmail
          ? usersByEmail.get(String(request.reviewedByEmail).toLowerCase())?.id || null
          : null
      });
    }
  }

  for (const user of users) {
    const membershipRole = getSchoolMembershipRole(user.status);
    if (user.school_id && membershipRole) {
      memberships.push({
        user_id: user.id,
        school_id: user.school_id,
        role: membershipRole,
        status: 'active'
      });
    } else if (user.school_id && !membershipRole) {
      console.warn(`Skipping school membership for unsupported role ${user.status} (${user.email || user.id}).`);
    }

    for (const classInfo of asArray(user.taughtClasses)) {
      if (!classInfo.id) continue;
      const resolvedSchoolId = resolveClassSchoolId(classInfo, user.school_id);
      if (!resolvedSchoolId) {
        console.warn(`Skipping class ${classInfo.id} for ${user.email || user.id}: no school_id available.`);
        continue;
      }
      const school = schoolsById.get(String(resolvedSchoolId));
      const classId = legacyIdToUuid(classInfo.id);
      classes.set(String(classInfo.id), {
        id: classId,
        school_id: school?.id || resolvedSchoolId,
        name: classInfo.name || 'Unnamed Class',
        subject: classInfo.subject || null,
        created_by: user.id,
        created_at: classInfo.createdAt || new Date().toISOString()
      });
      classMembers.push({ class_id: classId, user_id: user.id, role: 'Teacher' });
      for (const studentEmail of asArray(classInfo.students)) {
        const student = usersByEmail.get(String(studentEmail).toLowerCase());
        if (student) classMembers.push({ class_id: classId, user_id: student.id, role: 'Student' });
      }

      for (const [studentEmail, studentGrades] of Object.entries(classInfo.studentGrades || {})) {
        const student = usersByEmail.get(String(studentEmail).toLowerCase());
        if (!student || !studentGrades || typeof studentGrades !== 'object') continue;
        for (const [fieldName, score] of Object.entries(studentGrades)) {
          const workId = legacyIdToUuid(`${classInfo.id}:grade:${fieldName}`);
          if (!classwork.some((item) => item.id === workId)) {
            classwork.push({
              id: workId,
              class_id: classId,
              title: fieldName,
              description: 'Migrated grade field',
              created_by: user.id
            });
          }
          grades.push({
            id: legacyIdToUuid(`${classInfo.id}:grade:${studentEmail}:${fieldName}`),
            classwork_id: workId,
            student_id: student.id,
            score: score === '' || score === null || score === undefined || !Number.isFinite(Number(score)) ? null : Number(score)
          });
        }
      }
    }

    for (const classId of asArray(user.enrolledClasses)) {
      pendingEnrollments.push({ legacyClassId: String(classId), userId: user.id });
    }
  }

  for (const enrollment of pendingEnrollments) {
    if (classes.has(enrollment.legacyClassId)) {
      classMembers.push({
        class_id: legacyIdToUuid(enrollment.legacyClassId),
        user_id: enrollment.userId,
        role: 'Student'
      });
    }
  }

  if (fs.existsSync(storageFilesPath)) {
    for (const filename of fs.readdirSync(storageFilesPath)) {
      const filePath = path.join(storageFilesPath, filename);
      if (!fs.statSync(filePath).isFile()) continue;
      storedFiles.push({
        id: legacyIdToUuid(`file:${filename}`),
        school_id: null,
        class_id: null,
        uploaded_by: null,
        filename,
        storage_path: path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/'),
        created_at: fs.statSync(filePath).birthtime.toISOString()
      });
    }
  }

  const classMemberRows = uniqueRows(classMembers, (row) => `${row.class_id}:${row.user_id}`);
  const membershipRows = uniqueRows(memberships, (row) => `${row.user_id}:${row.school_id}`);
  const migrationCounts = {
    schools: schools.length,
    users: users.length,
    settings: settings.length,
    themes: themes.length,
    memberships: membershipRows.length,
    classes: classes.size,
    classMembers: classMemberRows.length,
    classwork: classwork.length,
    grades: grades.length,
    files: storedFiles.length,
    joinRequests: joinRequests.length
  };

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, schemaVerified: true, ...migrationCounts }, null, 2));
    return;
  }

  if (settings.length) failIfError(await supabase.from('school_settings').upsert(settings, { onConflict: 'school_id' }), 'Writing school settings');
  if (themes.length) failIfError(await supabase.from('school_themes').upsert(themes, { onConflict: 'school_id' }), 'Writing school themes');
  if (membershipRows.length) {
    failIfError(await supabase.from('school_memberships').upsert(membershipRows, { onConflict: 'user_id,school_id' }), 'Writing memberships');
  }
  if (classes.size) {
    failIfError(await supabase.from('classes').upsert([...classes.values()], { onConflict: 'id' }), 'Writing classes');
  }
  if (classMemberRows.length) {
    failIfError(await supabase.from('class_members').upsert(classMemberRows, { onConflict: 'class_id,user_id' }), 'Writing class members');
  }
  if (classwork.length) {
    failIfError(await supabase.from('classwork').upsert(classwork, { onConflict: 'id' }), 'Writing classwork');
  }
  if (grades.length) {
    failIfError(await supabase.from('grades').upsert(grades, { onConflict: 'id' }), 'Writing grades');
  }
  if (storedFiles.length) {
    failIfError(await supabase.from('files').upsert(storedFiles, { onConflict: 'id' }), 'Writing files');
  }
  const vicTheme = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vic-theme.json'), 'utf8'));
  failIfError(await supabase.from('global_settings').upsert({ key: 'vic_theme', value: vicTheme }, { onConflict: 'key' }), 'Writing global settings');

  if (joinRequests.length) {
    for (const request of joinRequests) {
      const { data: existing, error: existingError } = await supabase
        .from('school_join_requests')
        .select('user_id')
        .eq('user_id', request.user_id)
        .eq('school_id', request.school_id)
        .eq('status', request.status)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(`Checking join request: ${existingError.message}`);
      if (!existing) {
        failIfError(await supabase.from('school_join_requests').insert(request), 'Writing join request');
      }
    }
  }

  console.log(JSON.stringify({
    ...migrationCounts,
    dryRun: false
  }, null, 2));
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
