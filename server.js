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

// Separate multer for the stimulus program image
let imageUploadCounter = 0;
const ctStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public'); // Save directly to public to serve it easily
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        imageUploadCounter++;
        cb(null, 'chuongtrinh_image_' + Date.now() + '_' + String(imageUploadCounter).padStart(3, '0') + ext);
    }
});
const ctUpload = multer({ storage: ctStorage });

// Serve static files from 'public' directory
app.use(express.static('public'));

// Parse JSON and URL-encoded bodies for form submits
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// API to get Tiến độ sheet data
app.get('/api/tiendo', (req, res) => {
    const filePath = path.join(__dirname, 'filetiendo.xlsx');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Data file not found' });
    }

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'tiến độ');

        if (!sheetName) {
            return res.status(404).json({ error: 'Sheet "tiến độ" not found' });
        }

        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        res.json(data);
    } catch (error) {
        console.error("Error reading excel file:", error);
        res.status(500).json({ error: 'Failed to read data file' });
    }
});

// API to get stimulus program details (JSON)
app.get('/api/chuongtrinh', (req, res) => {
    const filePath = path.join(__dirname, 'chuongtrinh.txt');
    let textInfo = '';
    if (fs.existsSync(filePath)) {
        textInfo = fs.readFileSync(filePath, 'utf8');
    }

    // Check if images exist
    const publicDir = path.join(__dirname, 'public');
    let imageUrls = [];
    if (fs.existsSync(publicDir)) {
        const files = fs.readdirSync(publicDir);
        // Find all images matching the prefix
        const imageFiles = files.filter(f => f.startsWith('chuongtrinh_image_'));
        // Sort them just so they maintain a somewhat consistent order (by timestamp)
        imageFiles.sort();
        if (imageFiles.length > 0) {
            imageUrls = imageFiles.map(f => '/' + f);
        }
    }

    // We still pass imageUrl (the first one) for backwards compatibility or single image displays,
    // but also pass the full array imageUrls.
    res.json({ text: textInfo, imageUrl: imageUrls.length > 0 ? imageUrls[0] : null, imageUrls: imageUrls });
});

// API to update stimulus program text and images
app.post('/api/admin/chuongtrinh', ctUpload.array('image', 3), (req, res) => {
    if (req.body.password !== "admin123") {
        return res.status(401).send('Sai mật khẩu!');
    }
    const text = req.body.text || '';
    const filePath = path.join(__dirname, 'chuongtrinh.txt');

    // If ANY new images were uploaded, delete ALL existing ones first to replace them.
    // If the user uploads nothing, we keep the existing images.
    // To completely delete images without uploading new ones, they would use the 'deleteImage' flag.
    if (req.files && req.files.length > 0) {
        const publicDir = path.join(__dirname, 'public');
        if (fs.existsSync(publicDir)) {
            const files = fs.readdirSync(publicDir);

            // Collect the filenames of the newly uploaded files so we don't delete them
            const newFileNames = req.files.map(f => f.filename);

            files.forEach(f => {
                if (f.startsWith('chuongtrinh_image_') && !newFileNames.includes(f)) {
                    fs.unlinkSync(path.join(publicDir, f));
                }
            });
        }
    }

    // If user wants to clear all images explicitly
    if (req.body.deleteImage === "true") {
        const publicDir = path.join(__dirname, 'public');
        if (fs.existsSync(publicDir)) {
            const files = fs.readdirSync(publicDir);
            files.forEach(f => {
                if (f.startsWith('chuongtrinh_image_')) {
                    fs.unlinkSync(path.join(publicDir, f));
                }
            });
        }
    }

    try {
        fs.writeFileSync(filePath, text);

        // 5. Tự động push lên GitHub
        console.log("Bắt đầu tự động push Chương trình kích thích lên GitHub...");

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
            const pushCommand = `git add chuongtrinh.txt "public/chuongtrinh_image*" && git commit -m "Auto update Chuong trinh Kich thich" && git push https://${githubToken}@${repoUrl} HEAD:main -f`;
            runGitPush(pushCommand);
        } else {
            console.log("Thiếu GITHUB_TOKEN hoặc REPO_URL. Thử commit local và push mặc định...");
            const fallbackCommand = `git add chuongtrinh.txt "public/chuongtrinh_image*" && git commit -m "Auto update Chuong trinh Kich thich" && git push`;
            runGitPush(fallbackCommand);
        }

        res.send('Cập nhật chương trình kích thích kênh thành công! Hệ thống đang đồng bộ lên đám mây...');
    } catch (err) {
        console.error("Error writing text file:", err);
        res.status(500).send('Lỗi ghi file: ' + err.message);
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

        // 1. Dùng trực tiếp file được upload đè lên filetiendo.xlsx
        fs.copyFileSync(uploadedFilePath, targetFilePath);
        console.log("File copied successfully.");

        // 2. Tự động push lên GitHub
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

        res.send(`Cập nhật toàn bộ file dữ liệu thành công!\nHệ thống đang tự động đồng bộ dữ liệu lên GitHub trong nền...`);

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send('Lỗi máy chủ: ' + err.message);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
