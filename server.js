const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
const net = require('net');
const ffmpegController = require('./controllers/ffmpegController');

// Create uploads and output directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: function (req, file, cb) {
    // Accept video files only
    if (!file.originalname.match(/\.(mp4|avi|mov|wmv|flv|mkv)$/)) {
      return cb(new Error('Only video files are allowed!'), false);
    }
    cb(null, true);
  }
});

const app = express();
const DEFAULT_PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static('public'));
app.use('/output', express.static(outputDir));

// Routes
app.post('/api/resize', upload.single('video'), ffmpegController.resizeVideo);
app.post('/api/extract-audio', upload.single('video'), ffmpegController.extractAudio);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong!' });
});

// Function to check if a port is in use
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors are not related to port availability
        resolve(true);
      }
    });

    server.once('listening', () => {
      // Close the server if it's listening
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

// Function to find an available port
async function findAvailablePort(startPort, maxAttempts = 10) {
  let port = startPort;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    port++;
    attempts++;
  }

  throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
}

// Start the server on an available port
(async () => {
  try {
    const port = await findAvailablePort(DEFAULT_PORT);
    app.listen(port, () => {
      // For normal usage, keep these logs
      console.log(`Server running on port ${port}`);
      console.log(`Visit http://localhost:${port} to access the application`);

      // For Claude Desktop integration, output valid JSON to stderr
      // Claude Desktop can be configured to capture stderr for JSON output
      console.error(JSON.stringify({
        status: "running",
        port: port,
        url: `http://localhost:${port}`
      }));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();