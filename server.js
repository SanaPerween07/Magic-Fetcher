import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// app.use(cors({origin:true , credentials:true}));

const allowedOrigins = [
  'https://magic-video-fetcher.onrender.com',  // Frontend domain
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) { // Allow the request if the origin is in the allowed list
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS')); // Reject other origins
    }
  },
  credentials: true, // Allow credentials (cookies, etc.) to be sent
};

app.use(cors(corsOptions));  // Apply custom CORS configuration


app.use(express.json());

// Store progress for each download
const progressMap = new Map();

// SSE endpoint for progress updates
app.get('/api/progress/:videoId', (req, res) => {
  const videoId = req.params.videoId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial progress
  res.write(`data: ${progressMap.get(videoId) || 0}\n\n`);

  // Setup interval to send progress updates
  const intervalId = setInterval(() => {
    const progress = progressMap.get(videoId) || 0;
    res.write(`data: ${progress}\n\n`);
  }, 1000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(intervalId);
    progressMap.delete(videoId);
  });
});

app.post('/api/get-title', (req, res) => {
  const { url } = req.body;

  // Validate URL
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Use the correct yt-dlp command syntax
  const ytDlpCommand = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const getInfoCommand = `${ytDlpCommand} --dump-json "${url}"`;

  exec(getInfoCommand, (error, stdout, stderr) => {
    if (error) {
      console.error("Error fetching info:", stderr);
      return res.status(500).json({
        error: "Failed to fetch video info",
        details: stderr,
      });
    }

    try {
      // Parse the JSON response from yt-dlp
      const videoInfo = JSON.parse(stdout);
      const channel = videoInfo.uploader || "Unknown Channel";
      const title = videoInfo.title || "Untitled";
      const videoId = videoInfo.id || "Unknown ID";

      // Return extracted information
      res.json({ channel, title, videoId });
    } catch (parseError) {
      console.error("Error parsing yt-dlp output:", parseError);
      res.status(500).json({ error: "Failed to parse video information" });
    }
  });
});


app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(os.homedir(), 'Downloads', 'yt-downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Generate a unique filename
    const timestamp = new Date().getTime();
    const outputPath = path.join(downloadsDir, `video_${timestamp}.mp4`);

    // Download command that saves the file
    const command =
      process.platform === 'win32'
        ? `yt-dlp -q "${url}" -f "best[ext=mp4]" -o "${outputPath}" >nul 2>&1`
        : `yt-dlp -q "${url}" -f "best[ext=mp4]" -o "${outputPath}" 2>/dev/null`;

    console.log('\nStarting download for:', url);

    exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Download error:', error);
        return res.status(500).json({ error: 'Download failed' });
      }

      console.log('✅ Download completed successfully\n');

      // Send the file
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');

      const fileStream = fs.createReadStream(outputPath);
      fileStream.pipe(res);

      // Clean up after sending
      res.on('finish', () => {
        console.log('✅ Response sent to client\n');

        // Remove the downloaded file
        fs.unlink(outputPath, (err) => {
          if (err) {
            console.error('Error deleting file:', err);
            return;
          }

          // Check if directory is empty and remove it if it is
          fs.readdir(downloadsDir, (err, files) => {
            if (err) {
              console.error('Error reading directory:', err);
              return;
            }

            if (files.length === 0) {
              fs.rmdir(downloadsDir, (err) => {
                if (err) {
                  console.error('Error removing directory:', err);
                } else {
                  console.log('✅ Cleaned up yt-downloads folder\n');
                }
              });
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Downloads will be saved to: ${path.join(os.homedir(), 'Downloads', 'yt-downloads')}`);
});
