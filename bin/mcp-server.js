#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Run the server in a child process
const serverPath = path.join(__dirname, '..', 'server.js');
const server = spawn('node', [serverPath], {
  stdio: ['ignore', 'pipe', 'pipe']
});

// Capture stdout to extract the port information
let portInfo = null;
server.stdout.on('data', (data) => {
  // Extract port from the output
  const portMatch = data.toString().match(/Server running on port (\d+)/);
  if (portMatch && portMatch[1]) {
    portInfo = {
      status: "running",
      port: parseInt(portMatch[1]),
      url: `http://localhost:${portMatch[1]}`
    };

    // Output valid JSON for Claude Desktop
    console.log(JSON.stringify(portInfo));
  }
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  process.exit(0);
});

server.on('close', (code) => {
  process.exit(code);
});