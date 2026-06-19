const express = require('express');
const multer  = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip'); // Our new unzipping tool

const app = express();

// 1. Setup storage for the incoming zip
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './vault/'),
  filename: (req, file, cb) => cb(null, `site-${Date.now()}.zip`)
});
const upload = multer({ storage: storage });

// Make sure our main vault folder exists
if (!fs.existsSync('./vault')) fs.mkdirSync('./vault');

// 2. This endpoint catches, logs, and extracts the website push
app.post('/archive-push', upload.single('website_zip'), (req, res) => {
  const timestamp = Date.now();
  const zipPath = req.file.path;
  const extractPath = path.join(__dirname, 'vault', `version-${timestamp}`);

  try {
    // Extract the zip file into its own unique timestamp folder
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);
    
    console.log(`Successfully archived Version: version-${timestamp}`);
    
    // Optional: Delete the original zip file to save space
    fs.unlinkSync(zipPath); 

    res.status(200).send(`Version ${timestamp} archived perfectly.`);
	res.status(201).json({ status: "VERIFIED_AND_STORED", version: timestamp });
  } catch (error) {
    console.error('Extraction failed:', error);
    res.status(500).send('Failed to process archive.');
  }
});

app.listen(3000, () => console.log('Archive engine running on port 3000'));
