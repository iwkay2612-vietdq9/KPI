const express = require('express');
const xlsx = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

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
    const filePath = path.join(__dirname, 'filetiendo.xlsx');

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
    const filePath = path.join(__dirname, 'filetiendo.xlsx');

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

        const uploadedFilePath = path.join(__dirname, 'uploaded_data.xlsx');
        const targetFilePath = path.join(__dirname, 'filetiendo.xlsx');
        console.log("Uploaded File Path:", uploadedFilePath);
        console.log("Target File Path:", targetFilePath);

        // 1. Read the uploaded file
        console.log("Reading uploaded file...");
        const uploadedWorkbook = xlsx.readFile(uploadedFilePath);

        // Find the "gboc" source sheet (we'll assume the first sheet is gboc or specifically look for it)
        // Since we don't know the exact sheet name the user uploads for gboc, we used [0] before.
        const sourceSheetName = uploadedWorkbook.SheetNames[0];
        console.log("Source Sheet (gboc) Name:", sourceSheetName);
        const sourceSheet = uploadedWorkbook.Sheets[sourceSheetName];

        // Find the "cuoc" source sheet
        let sourceCuocSheetName = uploadedWorkbook.SheetNames.find(n => n.toLowerCase() === 'cuoc' || n.toLowerCase() === 'cước');
        // If not found by name, maybe it's the second sheet? We'll rely on name.
        let sourceCuocSheet = null;
        if (sourceCuocSheetName) {
            console.log("Found Source Cuoc Sheet:", sourceCuocSheetName);
            sourceCuocSheet = uploadedWorkbook.Sheets[sourceCuocSheetName];
        } else {
            console.log("No Cuoc sheet found in uploaded file.");
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
            targetWorkbook.SheetNames.splice(sheetIndex, 1);
            delete targetWorkbook.Sheets[targetSheetName];
        } else {
            console.log(`Sheet '${targetSheetName}' not found.`);
        }

        // Append new gboc sheet
        console.log(`Appending new '${targetSheetName}' sheet...`);
        xlsx.utils.book_append_sheet(targetWorkbook, sourceSheet, targetSheetName);

        // Update/Add "cuoc" sheet if it exists in the uploaded file
        if (sourceCuocSheet) {
            const targetCuocSheetName = "cuoc";
            let cuocSheetIndex = targetWorkbook.SheetNames.findIndex(n => n.toLowerCase() === 'cuoc');
            if (cuocSheetIndex > -1) {
                console.log(`Sheet 'cuoc' found at index ${cuocSheetIndex}. Removing...`);
                const nameToRemove = targetWorkbook.SheetNames[cuocSheetIndex];
                targetWorkbook.SheetNames.splice(cuocSheetIndex, 1);
                delete targetWorkbook.Sheets[nameToRemove];
            }
            console.log(`Appending new '${targetCuocSheetName}' sheet...`);
            xlsx.utils.book_append_sheet(targetWorkbook, sourceCuocSheet, targetCuocSheetName);
        }

        console.log("Sheets after update:", targetWorkbook.SheetNames);

        // 4. Save
        console.log("Writing to file...");
        xlsx.writeFile(targetWorkbook, targetFilePath);
        console.log("Write complete.");

        // 5. Tự động push lên GitHub
        console.log("Bắt đầu tự động push lên GitHub...");

        // Cần cài đặt biến môi trường GITHUB_TOKEN và REPO_URL trên Render
        // REPO_URL có định dạng: github.com/username/repo.git (không có https:// ở đầu)
        const githubToken = process.env.GITHUB_TOKEN;
        const repoUrl = process.env.REPO_URL;

        const runGitPush = (cmd) => {
            exec(`git config user.email "bot@admin.com" && git config user.name "Admin Bot" && ${cmd}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Auto-push error log: ${error.message}`);
                    if (stderr) console.error(`stderr: ${stderr}`);
                } else {
                    console.log(`Auto-push thành công! stdout: ${stdout}`);
                }
            });
        };

        if (githubToken && repoUrl) {
            // Push trực tiếp qua URL chứa token, bỏ qua 'origin'
            const pushCommand = `git add filetiendo.xlsx && git commit -m "Auto update Excel data tu Admin" && git push https://${githubToken}@${repoUrl} HEAD:main -f`;
            runGitPush(pushCommand);
        } else {
            console.log("Thiếu GITHUB_TOKEN hoặc REPO_URL. Thử commit local và push mặc định...");
            const fallbackCommand = `git add filetiendo.xlsx && git commit -m "Auto update Excel data tu Admin" && git push`;
            runGitPush(fallbackCommand);
        }

        if (sourceCuocSheet) {
            res.send('Cập nhật dữ liệu thành công vào tab "gboc" và "cuoc"!\nHệ thống đang tự động đồng bộ dữ liệu lên GitHub trong nền...');
        } else {
            res.send('Cập nhật dữ liệu thành công vào tab "gboc" (Không có tab Cước)!\nHệ thống đang tự động đồng bộ dữ liệu lên GitHub trong nền...');
        }

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send('Lỗi máy chủ: ' + err.message);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
