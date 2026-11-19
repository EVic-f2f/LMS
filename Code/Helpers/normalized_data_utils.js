const crypto = require("crypto");

function legacyIdToUuid(value) {
  const digest = crypto.createHash("md5").update(String(value)).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function mergeNormalizedClassData(users, classes, members, classwork, grades) {
  const usersById = new Map(users.filter((user) => user.id).map((user) => [String(user.id), user]));
  const classInfoById = new Map();
  const displayIdByClassId = new Map();

  for (const classRow of classes) {
    const classId = String(classRow.id);
    const teacher = usersById.get(String(classRow.created_by));
    if (!teacher) continue;

    if (!Array.isArray(teacher.taughtClasses)) teacher.taughtClasses = [];
    const existingIndex = teacher.taughtClasses.findIndex((classInfo) =>
      String(classInfo.id) === classId || legacyIdToUuid(classInfo.id) === classId
    );
    const existing = existingIndex >= 0 ? teacher.taughtClasses[existingIndex] : {};
    const displayId = existing.id || classId;
    const classInfo = {
      ...existing,
      id: displayId,
      name: existing.name || classRow.name || "Unnamed Class",
      subject: existing.subject || classRow.subject || "",
      school_id: existing.school_id || classRow.school_id || teacher.school_id || null,
      createdAt: existing.createdAt || classRow.created_at || ""
    };

    if (existingIndex >= 0) teacher.taughtClasses[existingIndex] = classInfo;
    else teacher.taughtClasses.push(classInfo);

    classInfoById.set(classId, classInfo);
    displayIdByClassId.set(classId, displayId);
  }

  for (const membership of members) {
    if (String(membership.role || "").toLowerCase() !== "student") continue;
    const classId = String(membership.class_id);
    const classInfo = classInfoById.get(classId);
    const student = usersById.get(String(membership.user_id));
    if (!classInfo || !student || !student.email) continue;

    const studentEmail = String(student.email).toLowerCase();
    const students = Array.isArray(classInfo.students) ? classInfo.students : [];
    if (!students.some((email) => String(email).toLowerCase() === studentEmail)) {
      classInfo.students = [...students, student.email];
    }

    if (!Array.isArray(student.enrolledClasses)) student.enrolledClasses = [];
    const displayId = displayIdByClassId.get(classId);
    if (!student.enrolledClasses.some((id) => String(id) === String(displayId))) {
      student.enrolledClasses.push(displayId);
    }
  }

  const classworkById = new Map(classwork.map((item) => [String(item.id), item]));
  const normalizedGradesByClass = new Map();
  const latestGradeUpdateByClass = new Map();
  for (const grade of grades) {
    const work = classworkById.get(String(grade.classwork_id));
    const student = usersById.get(String(grade.student_id));
    if (!work || !student?.email || !work.title) continue;

    const classId = String(work.class_id);
    if (!classInfoById.has(classId)) continue;
    if (!normalizedGradesByClass.has(classId)) normalizedGradesByClass.set(classId, {});

    const studentGrades = normalizedGradesByClass.get(classId);
    const email = String(student.email).toLowerCase();
    if (!studentGrades[email]) studentGrades[email] = {};
    studentGrades[email][work.title] = grade.score === null || grade.score === undefined
      ? ""
      : String(grade.score);

    const updatedAt = Date.parse(grade.updated_at || "");
    if (Number.isFinite(updatedAt) && updatedAt > (latestGradeUpdateByClass.get(classId) || 0)) {
      latestGradeUpdateByClass.set(classId, updatedAt);
    }
  }

  for (const [classId, classInfo] of classInfoById) {
    const normalizedGrades = normalizedGradesByClass.get(classId) || {};
    const legacyGrades = classInfo.studentGrades || {};
    const legacyUpdatedAt = Date.parse(classInfo.studentGradesUpdatedAt || "");
    const normalizedIsNewer = Object.keys(normalizedGrades).length > 0
      && (!Number.isFinite(legacyUpdatedAt) || (latestGradeUpdateByClass.get(classId) || 0) > legacyUpdatedAt);
    const mergedGrades = normalizedIsNewer ? { ...legacyGrades } : { ...normalizedGrades };

    const gradesToMerge = normalizedIsNewer ? normalizedGrades : legacyGrades;
    for (const [email, gradeValues] of Object.entries(gradesToMerge)) {
      const normalizedEmail = String(email).toLowerCase();
      mergedGrades[normalizedEmail] = {
        ...(mergedGrades[normalizedEmail] || {}),
        ...(gradeValues || {})
      };
    }
    classInfo.studentGrades = mergedGrades;
  }

  return users;
}

module.exports = { legacyIdToUuid, mergeNormalizedClassData };
