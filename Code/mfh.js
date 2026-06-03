const fs = require("fs");
const path = require("path");

// ==========================
// 📂 CORE FILE HANDLER
// ==========================
function fileHandler(fileName, folder = null, mode = "r", data = null, createIfNotExists = false) {
    fileName = String(fileName);
    if (!fileName.endsWith(".json")) fileName += ".json";

    const scriptDir = __dirname;

    let filePath;
    if (folder) {
        const folderPath = path.isAbsolute(folder) ? folder : path.join(scriptDir, folder);
        filePath = path.join(folderPath, fileName);

        if (createIfNotExists) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
    } else {
        filePath = path.join(scriptDir, fileName);
    }

    // ✍️ WRITE
    if (mode === "w") {
        if (folder && !createIfNotExists && !fs.existsSync(path.dirname(filePath))) {
            throw new Error(`Folder does not exist: ${path.dirname(filePath)}`);
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
        return data;
    }

    // 📖 READ
    if (mode === "r") {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            return JSON.parse(content);
        } catch (err) {
            if (err.code === "ENOENT") {
                console.log(`File not found: ${filePath}`);
            } else {
                console.log(`Invalid JSON in file: ${filePath}`);
            }
            return {};
        }
    }
}


function writeToJson(fileName, data, folder = null, createIfNotExists = true) {
    return fileHandler(fileName, folder, "w", data, createIfNotExists);
}


function createJsonStructure(fileName, structure, folder = null) {
    fileName = String(fileName);
    if (!fileName.endsWith(".json")) fileName += ".json";

    const scriptDir = __dirname;

    let filePath;
    if (folder) {
        const folderPath = path.join(scriptDir, folder);
        fs.mkdirSync(folderPath, { recursive: true });
        filePath = path.join(folderPath, fileName);
    } else {
        filePath = path.join(scriptDir, fileName);
    }

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(structure, null, 4));
    }

    return structure;
}


function findDictInJson(fileName, name, folder = null) {
    if (!fileName.endsWith(".json")) fileName += ".json";

    const scriptDir = __dirname;
    const filePath = folder
        ? path.join(scriptDir, folder, fileName)
        : path.join(scriptDir, fileName);

    let data;
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        data = JSON.parse(content);
    } catch {
        return null;
    }

    for (const categoryItems of Object.values(data)) {
        if (Array.isArray(categoryItems)) {
            for (const item of categoryItems) {
                if (item && item.name === name) {
                    return item;
                }
            }
        }
    }

    return null;
}

// ==========================
// 🔒 CLOSE FILE (RARELY USED IN NODE)
// ==========================
function closeFile(file) {
    try {
        if (file && typeof file.close === "function") {
            file.close();
        }
    } catch (e) {
        console.log(`Error closing file: ${e}`);
    }
}

// ==========================
// 📦 EXPORTS
// ==========================
module.exports = {
    fileHandler,
    writeToJson,
    createJsonStructure,
    findDictInJson,
    closeFile
};
