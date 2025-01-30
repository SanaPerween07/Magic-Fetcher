import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import fs from 'fs';
import YTDlpWrap from 'yt-dlp-wrap';

const app = express();
const PORT = process.env.PORT || 3000;
const ytDlp = new YTDlpWrap.default(); 

// Directory path setup
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// CORS configuration
const allowedOrigins = ['https://magic-video-fetcher.vercel.app'];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json());

// Store progress for each download
const progressMap = new Map();

app.get('/', (req, res) => {
  res.send('Hello world');
});

// SSE endpoint for progress updates
app.get('/api/progress/:videoId', (req, res) => {
  const videoId = req.params.videoId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', 'https://magic-video-fetcher.vercel.app');

  res.write(`data: ${progressMap.get(videoId) || 0}\n\n`);

  const intervalId = setInterval(() => {
    res.write(`data: ${progressMap.get(videoId) || 0}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(intervalId);
    progressMap.delete(videoId);
  });
});

// Endpoint to get video title
const { exec } = require('child_process');

app.post('/api/get-title', (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  exec(`yt-dlp --dump-json ${url}`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error fetching info:', err);
      return res.status(500).json({ error: 'Failed to fetch video info' });
    }

    if (stderr) {
      console.error('stderr:', stderr);
      return res.status(500).json({ error: 'Failed to fetch video info' });
    }

    try {
      const videoInfo = JSON.parse(stdout);
      res.json({
        channel: videoInfo.uploader || 'Unknown Channel',
        title: videoInfo.title || 'Untitled',
        videoId: videoInfo.id || 'Unknown ID',
      });
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// Endpoint to download video
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const downloadsDir = path.join(os.homedir(), 'Downloads', 'yt-downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    const timestamp = Date.now();
    const outputPath = path.join(downloadsDir, `video_${timestamp}.mp4`);

    console.log('\nStarting download for:', url);

    await ytDlp.execPromise([url, '-f', 'best[ext=mp4]', '-o', outputPath]);

    console.log('✅ Download completed successfully\n');

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video_${timestamp}.mp4"`);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    res.on('finish', () => {
      console.log('✅ Response sent to client\n');
      fs.unlink(outputPath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process request' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
