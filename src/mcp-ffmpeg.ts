import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, ExecOptions as ChildProcessExecOptions } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "node:os";
import notifier from "node-notifier";

const execAsync = promisify(exec);

// Create an MCP server
const server = new McpServer({
  name: "FFmpegProcessor",
  version: "1.0.0"
});

// Define available resolutions
const RESOLUTIONS = {
  "360p": { width: 640, height: 360 },
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 }
};

/**
 * Helper function to ask for permission using node-notifier
 */
async function askPermission(action: string): Promise<boolean> {
  // Skip notification if DISABLE_NOTIFICATIONS is set
  if (process.env.DISABLE_NOTIFICATIONS === 'true') {
    console.log(`Auto-allowing action (notifications disabled): ${action}`);
    return true;
  }

  return new Promise((resolve) => {
    notifier.notify({
      title: 'FFmpeg Processor Permission Request',
      message: `${action}`,
      wait: true,
      timeout: 60,
      actions: 'Allow',
      closeLabel: 'Deny'
    }, (err, response, metadata) => {
      if (err) {
        console.error('Error showing notification:', err);
        resolve(false);
        return;
      }

      const buttonPressed = metadata?.activationValue || response;
      resolve(buttonPressed !== 'Deny');
    });
  });
}

/**
 * Helper function to ensure output directories exist
 */
async function ensureDirectoriesExist() {
  const outputDir = path.join(os.tmpdir(), 'ffmpeg-output');
  try {
    await fs.mkdir(outputDir, { recursive: true });
    return outputDir;
  } catch (error) {
    console.error('Error creating output directory:', error);
    return os.tmpdir();
  }
}

// Tool to check FFmpeg version
server.tool(
  "get-ffmpeg-version",
  "Get the version of FFmpeg installed on the system",
  {},
  async () => {
    try {
      const { stdout, stderr } = await execAsync('ffmpeg -version');

      // Extract the version from the output
      const versionMatch = stdout.match(/ffmpeg version (\S+)/);
      const version = versionMatch ? versionMatch[1] : 'Unknown';

      return {
        content: [{
          type: "text" as const,
          text: `FFmpeg Version: ${version}\n\nFull version info:\n${stdout}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error getting FFmpeg version: ${errorMessage}\n\nMake sure FFmpeg is installed and in your PATH.`
        }]
      };
    }
  }
);

// Tool to resize video
server.tool(
  "resize-video",
  "Resize a video to one or more standard resolutions",
  {
    videoPath: z.string().describe("Path to the video file to resize"),
    resolutions: z.array(z.enum(["360p", "480p", "720p", "1080p"])).describe("Resolutions to convert the video to"),
    outputDir: z.string().optional().describe("Optional directory to save the output files (defaults to a temporary directory)")
  },
  async ({ videoPath, resolutions, outputDir }) => {
    try {
      // Resolve the absolute path
      const absVideoPath = path.resolve(videoPath);

      // Check if file exists
      try {
        await fs.access(absVideoPath);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: Video file not found at ${absVideoPath}`
          }]
        };
      }

      // Determine output directory
      let outputDirectory = outputDir ? path.resolve(outputDir) : await ensureDirectoriesExist();

      // Check if output directory exists and is writable
      try {
        await fs.access(outputDirectory, fs.constants.W_OK);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: Output directory ${outputDirectory} does not exist or is not writable`
          }]
        };
      }

      // Format command for permission request
      const resolutionsStr = resolutions.join(', ');
      const permissionMessage = `Resize video ${path.basename(absVideoPath)} to ${resolutionsStr}`;

      // Ask for permission
      const permitted = await askPermission(permissionMessage);

      if (!permitted) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: "Permission denied by user"
          }]
        };
      }

      // Get video filename without extension
      const videoFilename = path.basename(absVideoPath, path.extname(absVideoPath));

      // Define the type for our results
      type ResizeResult = {
        resolution: "360p" | "480p" | "720p" | "1080p";
        outputPath: string;
        success: boolean;
        error?: string;
      };

      // Process each resolution
      const results: ResizeResult[] = [];

      for (const resolution of resolutions) {
        const { width, height } = RESOLUTIONS[resolution as keyof typeof RESOLUTIONS];
        const outputFilename = `${videoFilename}_${resolution}${path.extname(absVideoPath)}`;
        const outputPath = path.join(outputDirectory, outputFilename);

        // Build FFmpeg command
        const command = `ffmpeg -i "${absVideoPath}" -vf "scale=${width}:${height}" -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k "${outputPath}"`;

        try {
          // Execute FFmpeg command
          const { stdout, stderr } = await execAsync(command);

          results.push({
            resolution,
            outputPath,
            success: true
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          results.push({
            resolution,
            outputPath,
            success: false,
            error: errorMessage
          });
        }
      }

      // Format results
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      let resultText = `Processed ${results.length} resolutions (${successCount} successful, ${failCount} failed)\n\n`;

      results.forEach(result => {
        if (result.success) {
          resultText += `✅ ${result.resolution}: ${result.outputPath}\n`;
        } else {
          resultText += `❌ ${result.resolution}: Failed - ${result.error}\n`;
        }
      });

      return {
        content: [{
          type: "text" as const,
          text: resultText
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error resizing video: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool to extract audio from video
server.tool(
  "extract-audio",
  "Extract audio from a video file",
  {
    videoPath: z.string().describe("Path to the video file to extract audio from"),
    format: z.enum(["mp3", "aac", "wav", "ogg"]).default("mp3").describe("Audio format to extract"),
    outputDir: z.string().optional().describe("Optional directory to save the output file (defaults to a temporary directory)")
  },
  async ({ videoPath, format, outputDir }) => {
    try {
      // Resolve the absolute path
      const absVideoPath = path.resolve(videoPath);

      // Check if file exists
      try {
        await fs.access(absVideoPath);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: Video file not found at ${absVideoPath}`
          }]
        };
      }

      // Determine output directory
      let outputDirectory = outputDir ? path.resolve(outputDir) : await ensureDirectoriesExist();

      // Check if output directory exists and is writable
      try {
        await fs.access(outputDirectory, fs.constants.W_OK);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: Output directory ${outputDirectory} does not exist or is not writable`
          }]
        };
      }

      // Format command for permission request
      const permissionMessage = `Extract ${format} audio from video ${path.basename(absVideoPath)}`;

      // Ask for permission
      const permitted = await askPermission(permissionMessage);

      if (!permitted) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: "Permission denied by user"
          }]
        };
      }

      // Get video filename without extension
      const videoFilename = path.basename(absVideoPath, path.extname(absVideoPath));
      const outputFilename = `${videoFilename}.${format}`;
      const outputPath = path.join(outputDirectory, outputFilename);

      // Determine audio codec based on format
      let audioCodec;
      switch (format) {
        case 'mp3':
          audioCodec = 'libmp3lame';
          break;
        case 'aac':
          audioCodec = 'aac';
          break;
        case 'wav':
          audioCodec = 'pcm_s16le';
          break;
        case 'ogg':
          audioCodec = 'libvorbis';
          break;
        default:
          audioCodec = 'libmp3lame';
      }

      // Build FFmpeg command
      const command = `ffmpeg -i "${absVideoPath}" -vn -acodec ${audioCodec} "${outputPath}"`;

      try {
        // Execute FFmpeg command
        const { stdout, stderr } = await execAsync(command);

        return {
          content: [{
            type: "text" as const,
            text: `Successfully extracted audio to: ${outputPath}`
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error extracting audio: ${errorMessage}`
          }]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error extracting audio: ${errorMessage}`
        }]
      };
    }
  }
);

// Tool to get video information
server.tool(
  "get-video-info",
  "Get detailed information about a video file",
  {
    videoPath: z.string().describe("Path to the video file to analyze")
  },
  async ({ videoPath }) => {
    try {
      // Resolve the absolute path
      const absVideoPath = path.resolve(videoPath);

      // Check if file exists
      try {
        await fs.access(absVideoPath);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: Video file not found at ${absVideoPath}`
          }]
        };
      }

      // Format command for permission request
      const permissionMessage = `Analyze video file ${path.basename(absVideoPath)}`;

      // Ask for permission
      const permitted = await askPermission(permissionMessage);

      if (!permitted) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: "Permission denied by user"
          }]
        };
      }

      // Build FFprobe command to get video information in JSON format
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${absVideoPath}"`;

      // Execute FFprobe command
      const { stdout, stderr } = await execAsync(command);

      // Parse the JSON output
      const videoInfo = JSON.parse(stdout);

      // Format the output in a readable way
      let formattedInfo = `Video Information for: ${path.basename(absVideoPath)}\n\n`;

      // Format information
      if (videoInfo.format) {
        formattedInfo += `Format: ${videoInfo.format.format_name}\n`;
        formattedInfo += `Duration: ${videoInfo.format.duration} seconds\n`;
        formattedInfo += `Size: ${(parseInt(videoInfo.format.size) / (1024 * 1024)).toFixed(2)} MB\n`;
        formattedInfo += `Bitrate: ${(parseInt(videoInfo.format.bit_rate) / 1000).toFixed(2)} kbps\n\n`;
      }

      // Stream information
      if (videoInfo.streams && videoInfo.streams.length > 0) {
        formattedInfo += `Streams:\n`;

        videoInfo.streams.forEach((stream: any, index: number) => {
          formattedInfo += `\nStream #${index} (${stream.codec_type}):\n`;

          if (stream.codec_type === 'video') {
            formattedInfo += `  Codec: ${stream.codec_name}\n`;
            formattedInfo += `  Resolution: ${stream.width}x${stream.height}\n`;
            formattedInfo += `  Frame rate: ${stream.r_frame_rate}\n`;
            if (stream.bit_rate) {
              formattedInfo += `  Bitrate: ${(parseInt(stream.bit_rate) / 1000).toFixed(2)} kbps\n`;
            }
          } else if (stream.codec_type === 'audio') {
            formattedInfo += `  Codec: ${stream.codec_name}\n`;
            formattedInfo += `  Sample rate: ${stream.sample_rate} Hz\n`;
            formattedInfo += `  Channels: ${stream.channels}\n`;
            if (stream.bit_rate) {
              formattedInfo += `  Bitrate: ${(parseInt(stream.bit_rate) / 1000).toFixed(2)} kbps\n`;
            }
          }
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: formattedInfo
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error getting video information: ${errorMessage}`
        }]
      };
    }
  }
);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FFmpeg MCP Server running");
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main();