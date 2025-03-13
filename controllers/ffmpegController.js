const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Define output directory
const outputDir = path.join(__dirname, '..', 'output');

// Available resolutions
const RESOLUTIONS = {
  '360p': { width: 640, height: 360 },
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 }
};

/**
 * Resize video to specified resolutions
 */
exports.resizeVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoPath = req.file.path;
    const filename = path.parse(req.file.filename).name;
    const resolutions = req.body.resolutions ? JSON.parse(req.body.resolutions) : Object.keys(RESOLUTIONS);

    // Validate resolutions
    const validResolutions = resolutions.filter(res => Object.keys(RESOLUTIONS).includes(res));

    if (validResolutions.length === 0) {
      return res.status(400).json({
        error: 'No valid resolutions specified',
        validOptions: Object.keys(RESOLUTIONS)
      });
    }

    const outputFiles = [];
    const processingPromises = validResolutions.map(resolution => {
      return new Promise((resolve, reject) => {
        const { width, height } = RESOLUTIONS[resolution];
        const outputFilename = `${filename}_${resolution}.mp4`;
        const outputPath = path.join(outputDir, outputFilename);

        ffmpeg(videoPath)
          .size(`${width}x${height}`)
          .output(outputPath)
          .on('end', () => {
            outputFiles.push({
              resolution,
              filename: outputFilename,
              path: `/output/${outputFilename}` // URL path, not filesystem path
            });
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error processing ${resolution}:`, err);
            reject(err);
          })
          .run();
      });
    });

    await Promise.all(processingPromises);

    res.status(200).json({
      message: 'Video processing completed',
      files: outputFiles
    });
  } catch (error) {
    console.error('Error in resizeVideo:', error);
    res.status(500).json({ error: error.message || 'Error processing video' });
  }
};

/**
 * Extract audio from video
 */
exports.extractAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoPath = req.file.path;
    const filename = path.parse(req.file.filename).name;
    const format = req.body.format || 'mp3';

    // Validate format
    const validFormats = ['mp3', 'aac', 'wav', 'ogg'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({
        error: 'Invalid audio format',
        validOptions: validFormats
      });
    }

    const outputFilename = `${filename}.${format}`;
    const outputPath = path.join(outputDir, outputFilename);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec(format === 'mp3' ? 'libmp3lame' : format === 'aac' ? 'aac' : format)
        .output(outputPath)
        .on('end', () => {
          res.status(200).json({
            message: 'Audio extraction completed',
            file: {
              format,
              filename: outputFilename,
              path: `/output/${outputFilename}` // URL path, not filesystem path
            }
          });
          resolve();
        })
        .on('error', (err) => {
          console.error('Error extracting audio:', err);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error('Error in extractAudio:', error);
    res.status(500).json({ error: error.message || 'Error extracting audio' });
  }
};