# MCP FFmpeg Video Processor

A Node.js server that uses FFmpeg to manipulate video files. This server provides APIs to:

- Resize videos to different resolutions (360p, 480p, 720p, 1080p)
- Extract audio from videos in various formats (MP3, AAC, WAV, OGG)

## Prerequisites

Before running this application, you need to have the following installed:

1. **Node.js** (v14 or higher)
2. **FFmpeg** - This is required for video processing

### Installing FFmpeg

#### On macOS:
```bash
brew install ffmpeg
```

#### On Ubuntu/Debian:
```bash
sudo apt update
sudo apt install ffmpeg
```

#### On Windows:
1. Download FFmpeg from the [official website](https://ffmpeg.org/download.html)
2. Extract the files to a folder (e.g., `C:\ffmpeg`)
3. Add the `bin` folder to your PATH environment variable

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/mcp-ffmpeg.git
cd mcp-ffmpeg
```

2. Install dependencies:
```bash
npm install
```

## Running the Server

Start the server with:

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

The server will start on port 3000 by default. You can access the web interface at:

```
http://localhost:3000
```

## API Endpoints

### Resize Video

**Endpoint:** `POST /api/resize`

**Form Data:**
- `video`: The video file to resize
- `resolutions`: (Optional) JSON array of resolutions to generate. Default: all resolutions.
  - Available options: `360p`, `480p`, `720p`, `1080p`

**Example using curl:**
```bash
curl -X POST -F "video=@path/to/video.mp4" -F "resolutions=[\"360p\",\"720p\"]" http://localhost:3000/api/resize
```

### Extract Audio

**Endpoint:** `POST /api/extract-audio`

**Form Data:**
- `video`: The video file to extract audio from
- `format`: (Optional) Audio format. Default: `mp3`
  - Available options: `mp3`, `aac`, `wav`, `ogg`

**Example using curl:**
```bash
curl -X POST -F "video=@path/to/video.mp4" -F "format=mp3" http://localhost:3000/api/extract-audio
```

## Project Structure

```
mcp-ffmpeg/
├── controllers/
│   └── ffmpegController.js  # FFmpeg processing logic
├── public/
│   └── index.html           # Web interface
├── uploads/                 # Temporary storage for uploaded files
├── output/                  # Output directory for processed files
├── server.js                # Main server file
├── package.json
└── README.md
```

## Notes

- Uploaded videos are stored temporarily in the `uploads` directory
- Processed videos and audio files are stored in the `output` directory
- The server has a file size limit of 500MB for uploads

## License

MIT