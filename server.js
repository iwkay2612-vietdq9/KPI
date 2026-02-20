const express = require('express');
const xlsx = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './');
    },
    filename: function (req, file, cb) {
        cb(null, 'uploaded_data.xlsx');
    }
});

const upload = multer({ storage: storage });

// Serve static files from 'public' directory
app.use(express.static('public'));

// API to get Excel data
app.get('/api/data', (req, res) => {
    const dataDir = process.env.DATA_DIR || __dirname;
    const filePath = path.join(dataDir, 'filetiendo.xlsx');
    console.log("Using data file at:", filePath);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Data file not found' });
    }

    try {
        const workbook = xlsx.readFile(filePath);
        // User wants data from "gboc" tab if possible, or just the first sheet?
        // "khi up file dữ liệu sẽ tự import vô tab gboc của filetiendo nhé"
        // "dữ liệu đầu vào" -> import to "gboc".
        // The display probably reads from "gboc"? 
        // Previously we just read SheetNames[0].
        // Let's try to read "gboc" sheet first, if not found read first sheet.
        let sheetName = "gboc";
        if (!workbook.Sheets[sheetName]) {
            sheetName = workbook.SheetNames[0];
        }

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
            return res.status(500).json({ error: 'Sheet not found' });
        }

        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        res.json(data);
    } catch (error) {
        console.error("Error reading excel file:", error);
        res.status(500).json({ error: 'Failed to read data file' });
    }
});

// API to get Cước sheet data
app.get('/api/cuoc', (req, res) => {
    const dataDir = process.env.DATA_DIR || __dirname;
    const filePath = path.join(dataDir, 'filetiendo.xlsx');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Data file not found' });
    }

    try {
        const workbook = xlsx.readFile(filePath);
        // Look for "cuoc" sheet (case insensitive?)
        // The list_dir showed "cuoc".
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'cuoc');

        if (!sheetName) {
            return res.status(404).json({ error: 'Sheet "cuoc" not found' });
        }

        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        res.json(data);
    } catch (error) {
        console.error("Error reading excel file:", error);
        res.status(500).json({ error: 'Failed to read data file' });
    }
});

// API to upload and import data
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        console.log("--- Starting Upload Process ---");
        // Password check
        if (req.body.password !== "admin123") {
            console.log("Password check failed");
            return res.status(401).send('Sai mật khẩu!');
        }

        if (!req.file) {
            console.log("No file uploaded");
            return res.status(400).send('Chưa chọn file.');
        }

        const dataDir = process.env.DATA_DIR || __dirname;
        const uploadedFilePath = path.join(__dirname, 'uploaded_data.xlsx'); // Upload stays in temp/root
        const targetFilePath = path.join(dataDir, 'filetiendo.xlsx');
        console.log("Uploaded File Path:", uploadedFilePath);
        console.log("Target File Path:", targetFilePath);

        // 1. Read the uploaded file
        console.log("Reading uploaded file...");
        const uploadedWorkbook = xlsx.readFile(uploadedFilePath);
        const sourceSheetName = uploadedWorkbook.SheetNames[0];
        console.log("Source Sheet Name:", sourceSheetName);
        const sourceSheet = uploadedWorkbook.Sheets[sourceSheetName];

        // Debug: Check a cell in source to verify content
        try {
            const ref = sourceSheet['!ref'];
            console.log("Source Sheet Range:", ref);
        } catch (e) {
            console.log("Could not read source sheet range");
        }

        // 2. Read or Create Target Query (filetiendo.xlsx)
        let targetWorkbook;
        if (fs.existsSync(targetFilePath)) {
            console.log("Target file exists. Reading...");
            targetWorkbook = xlsx.readFile(targetFilePath);
        } else {
            console.log("Target file does not exist. Creating new.");
            targetWorkbook = xlsx.utils.book_new();
        }

        // 3. Update/Add "gboc" sheet
        const targetSheetName = "gboc";

        console.log("Sheets before update:", targetWorkbook.SheetNames);

        // Remove existing "gboc" if exists
        let sheetIndex = targetWorkbook.SheetNames.indexOf(targetSheetName);
        if (sheetIndex > -1) {
            console.log(`Sheet '${targetSheetName}' found at index ${sheetIndex}. Removing...`);
            // Remove from SheetNames
            targetWorkbook.SheetNames.splice(sheetIndex, 1);
            // Remove from Sheets object
            delete targetWorkbook.Sheets[targetSheetName];
        } else {
            console.log(`Sheet '${targetSheetName}' not found.`);
        }

        // Append new sheet
        console.log(`Appending new '${targetSheetName}' sheet...`);
        xlsx.utils.book_append_sheet(targetWorkbook, sourceSheet, targetSheetName);

        console.log("Sheets after update:", targetWorkbook.SheetNames);

        // 4. Save
        console.log("Writing to file...");
        xlsx.writeFile(targetWorkbook, targetFilePath);
        console.log("Write complete.");

        res.send('Cập nhật dữ liệu thành công vào tab "gboc"!');

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send('Lỗi máy chủ: ' + err.message);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
