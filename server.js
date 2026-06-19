const express = require('express');
const multer  = require('multer');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const cheerio = require('cheerio'); // Our advanced DOM rewriter

const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './vault/'),
  filename: (req, file, cb) => cb(null, `site-${Date.now()}.zip`)
});
const upload = multer({ storage: storage });

const VAULT_DIR = path.join(__dirname, 'vault');
const OBJECTS_DIR = path.join(__dirname, 'objects');
fs.ensureDirSync(VAULT_DIR);
fs.ensureDirSync(OBJECTS_DIR);

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// 🌐 THE CORE ASSET REWRITER ENGINE
function rewriteHtmlAssets(htmlContent, siteId, timestamp) {
  // Load the raw HTML text into a virtual editable browser DOM
  const $ = cheerio.load(htmlContent);
  const playbackBase = `/vault/site-${siteId}/version-${timestamp}/`;

  console.log(`🛠️ Running DOM Parser and rewriting paths...`);

  // 1. Rewrite Images, Audios, and Videos
  $('img, video, audio, source').each((i, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('http') && !src.startsWith('data:')) {
      // Convert relative paths to our absolute version folder paths
      const cleanPath = path.normalize(src).replace(/^\\|^\//, '');
      $(el).attr('src', playbackBase + cleanPath);
    }
  });

  // 2. Rewrite Stylesheets and JavaScript Files
  $('link[rel="stylesheet"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('http')) {
      const cleanPath = path.normalize(href).replace(/^\\|^\//, '');
      $(el).attr('href', playbackBase + cleanPath);
    }
  });

  $('script').each((i, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('http')) {
      const cleanPath = path.normalize(src).replace(/^\\|^\//, '');
      $(el).attr('src', playbackBase + cleanPath);
    }
  });

  // 3. Rewrite Hyperlinks (Keeps the user trapped inside the time machine)
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('http') && !href.startsWith('#')) {
      const cleanPath = path.normalize(href).replace(/^\\|^\//, '');
      // Force clicking this link to route through our historical page engine
      $(el).attr('href', playbackBase + cleanPath);
    }
  });

  // Return the fully transformed, self-contained HTML code
  return $.html();
}

app.post('/archive-push', upload.single('website_zip'), (req, res) => {
  const siteId = req.headers['x-site-id'] || 'default-site';
  const timestamp = Date.now();
  const zipPath = req.file.path;
  
  const siteVaultDir = path.join(VAULT_DIR, `site-${siteId}`);
  const targetFolder = path.join(siteVaultDir, `version-${timestamp}`);

  try {
    fs.ensureDirSync(siteVaultDir);
    
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetFolder, true);
    fs.unlinkSync(zipPath);

    console.log(`\n🏢 [Tenant: ${siteId}] Ingesting version-${timestamp}...`);

    // Scan, parse, and rewrite the HTML files before doing deduplication
    const files = fs.readdirSync(targetFolder);
    files.forEach(fileName => {
      const currentFilePath = path.join(targetFolder, fileName);
      if (fs.statSync(currentFilePath).isDirectory()) return;

      // Check if the file is an HTML web page
      if (path.extname(fileName) === '.html') {
        const rawHtml = fs.readFileSync(currentFilePath, 'utf8');
        // Execute the complete path repair rewrite!
        const rewrittenHtml = rewriteHtmlAssets(rawHtml, siteId, timestamp);
        fs.writeFileSync(currentFilePath, rewrittenHtml);
      }

      // Now run the deduplication logic on the repaired file
      const fileHash = getFileHash(currentFilePath);
      const masterStoragePath = path.join(OBJECTS_DIR, fileHash);

      if (fs.existsSync(masterStoragePath)) {
        fs.unlinkSync(currentFilePath);
        fs.writeFileSync(currentFilePath + '.pointer', `REF:${fileHash}`);
      } else {
        fs.copySync(currentFilePath, masterStoragePath);
      }
    });

    console.log(`✅ [Tenant: ${siteId}] Version rewritten and optimized perfectly.`);
    res.status(201).json({ status: "VERIFIED_AND_STORED", version: timestamp });

  } catch (error) {
    console.error(`Failure:`, error);
    res.status(500).send('Error processing assets.');
  }
});

// Serve folders statically so rewritten assets can load smoothly in browsers
app.use('/vault', express.static(VAULT_DIR));
app.use('/objects', express.static(OBJECTS_DIR));

// (Your previous app.get('/', ...) and /compare routes go down here)

app.listen(3000, () => console.log('🔥 Asset-Rewriting History Engine Active on Port 3000'));
