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

// 1. Tell the server where to find your master deduplicated files
app.use('/objects', express.static(path.join(__dirname, 'objects')));

// 2. Build the Time-Travel Homepage UI
app.get('/', (req, res) => {
  const vaultPath = path.join(__dirname, 'vault');
  
  // Read all saved versions in your vault folder
  let versions = [];
  if (fs.existsSync(vaultPath)) {
    versions = fs.readdirSync(vaultPath).filter(f => f.startsWith('version-'));
  }

  // Generate a clean HTML dashboard with a Time Slider
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>⏱️ Perfect Website History Engine</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; background: #f4f4f9; color: #333; }
        .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto; }
        h1 { margin-top: 0; color: #111; }
        .slider-box { margin: 30px 0; background: #eef2f7; padding: 20px; border-radius: 8px; text-align: center; }
        input[type=range] { width: 100%; margin-top: 15px; }
        iframe { width: 100%; height: 400px; border: 2px solid #ddd; border-radius: 8px; background: white; }
        .timestamp { font-weight: bold; color: #0066cc; font-size: 1.2em; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⏱️ Website History Time-Traveler</h1>
        <p>Drag the slider below to step through every single update before it went live.</p>
        
        <div class="slider-box">
          <div>Viewing Version Archived At: <span id="timeLabel" class="timestamp">Loading...</span></div>
          <input type="range" id="timeSlider" min="0" max="${versions.length - 1}" value="${versions.length - 1}">
        </div>

        <h3>Live Replay Canvas:</h3>
        <div id="canvasContainer">
          <p id="noVersions" style="display:none;">No historical snapshots found in vault yet.</p>
          <iframe id="playbackFrame" src=""></iframe>
        </div>
      </div>

      <script>
        // Pass our backend version folders straight into the browser JavaScript
        const versions = ${JSON.stringify(versions)};
        const slider = document.getElementById('timeSlider');
        const label = document.getElementById('timeLabel');
        const iframe = document.getElementById('playbackFrame');

        if (versions.length === 0) {
          document.getElementById('noVersions').style.display = 'block';
          iframe.style.display = 'none';
          slider.style.disabled = true;
        } else {
          function updatePlayback(index) {
            const folderName = versions[index];
            // Extract the original timestamp number from the folder name
            const ms = parseInt(folderName.replace('version-', ''));
            const date = new Date(ms).toLocaleString();
            
            label.innerText = date;
            
            // Route the iframe to load the preview helper endpoint
            iframe.src = '/view-version/' + folderName;
          }

          slider.addEventListener('input', (e) => updatePlayback(e.target.value));
          updatePlayback(slider.value); // Load the latest version on launch
        }
      </script>
    </body>
    </html>
  `);
});

// 3. Build the Playback Reconstruction Engine
app.get('/view-version/:folderName', (req, res) => {
  const folderName = req.params.folderName;
  const timestamp = folderName.replace('version-', ''); // Get the exact historical time
  
  const pointerPath = path.join(__dirname, 'vault', folderName, 'index.html.pointer');
  const realHtmlPath = path.join(__dirname, 'vault', folderName, 'index.html');

  let rawHtml = '';

  // 1. Reconstruct the deduplicated file on the fly
  if (fs.existsSync(pointerPath)) {
    const pointerContent = fs.readFileSync(pointerPath, 'utf8');
    const fileHash = pointerContent.replace('REF:', '').trim();
    rawHtml = fs.readFileSync(path.join(__dirname, 'objects', fileHash), 'utf8');
  } else if (fs.existsSync(realHtmlPath)) {
    rawHtml = fs.readFileSync(realHtmlPath, 'utf8');
  } else {
    return res.status(404).send('Snapshot file missing.');
  }

  // 2. DETEKTMINISTIC PLAYBACK INJECTION
  // We inject a small script into the old HTML before showing it.
  // This script intercepts any network calls and tacks on our time token!
  const injectionScript = `
    <script>
      window.__ARCHIVE_TIMESTAMP__ = "${timestamp}";
      console.log("⏱️ Archive Sandbox Active. Locked to timestamp: " + window.__ARCHIVE_TIMESTAMP__);
      
      // Hijack the browser's standard 'fetch' command for API sandboxing
      const originalFetch = window.fetch;
      window.fetch = function(url, options = {}) {
        const separator = url.includes('?') ? '&' : '?';
        // Force the request to route through our historical database time-proxy
        const timeTravelUrl = url + separator + 'archive_snapshot=' + window.__ARCHIVE_TIMESTAMP__;
        return originalFetch(timeTravelUrl, options);
      };
    </script>
  `;

  // Insert our sandbox script right at the top of the webpage head
  const sandboxedHtml = rawHtml.replace('<head>', '<head>' + injectionScript);
  
  res.setHeader('Content-Type', 'text/html');
  res.send(sandboxedHtml);
});


app.listen(3000, () => console.log('Advanced Deduplication Storage Engine Live on Port 3000'));
