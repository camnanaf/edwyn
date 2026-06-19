const express = require('express');
const multer  = require('multer');
const fs = require('fs-extra'); // Upgraded file tool
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto'); // Built-in hashing tool

const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './vault/'),
  filename: (req, file, cb) => cb(null, `site-${Date.now()}.zip`)
});
const upload = multer({ storage: storage });

// Create our advanced storage directories
const VAULT_DIR = path.join(__dirname, 'vault');
const OBJECTS_DIR = path.join(__dirname, 'objects'); // Master deduplicated file vault
fs.ensureDirSync(VAULT_DIR);
fs.ensureDirSync(OBJECTS_DIR);

// Helper function to find a file's unique cryptographic fingerprint
function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256'); // Standard high-security hash
  hashSum.update(fileBuffer);
  return hashSum.digest('hex'); // Returns a unique string of characters
}

app.post('/archive-push', upload.single('website_zip'), (req, res) => {
  const timestamp = Date.now();
  const zipPath = req.file.path;
  const targetFolder = path.join(VAULT_DIR, `version-${timestamp}`);

  try {
    // 1. Extract incoming snapshot
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetFolder, true);
    fs.unlinkSync(zipPath); // Clear the zip

    console.log(`\n📦 Processing incoming version-${timestamp}...`);

    // 2. Scan every file in the newly extracted folder
    const files = fs.readdirSync(targetFolder);
    
    files.forEach(fileName => {
      const currentFilePath = path.join(targetFolder, fileName);
      
      // Skip folders, only scan actual files
      if (fs.statSync(currentFilePath).isDirectory()) return;

      // 3. Find the file's fingerprint
      const fileHash = getFileHash(currentFilePath);
      const masterStoragePath = path.join(OBJECTS_DIR, fileHash);

      // 4. Deduplication Logic
      if (fs.existsSync(masterStoragePath)) {
        // We ALREADY have this file saved in our master library!
        console.log(`➡️  Duplicate found for [${fileName}]. Referencing master storage.`);
        fs.unlinkSync(currentFilePath); // Delete the local duplicate copy safely
        
        // Save a tiny text file pointing to the master file instead
        fs.writeFileSync(currentFilePath + '.pointer', `REF:${fileHash}`);
      } else {
        // This is a BRAND NEW change or new file. Save it to master storage!
        console.log(`✨ New asset detected [${fileName}]. Saving fingerprint: ${fileHash.substring(0, 8)}...`);
        fs.copySync(currentFilePath, masterStoragePath);
      }
    });

    console.log(`✅ Version ${timestamp} optimized and stored perfectly.`);
    res.status(201).json({ status: "VERIFIED_AND_STORED", version: timestamp });

  } catch (error) {
    console.error('Storage Engine Failure:', error);
    res.status(500).send('Storage engine error.');
  }
});

app.listen(3000, () => console.log('Advanced Deduplication Storage Engine Live on Port 3000'));
