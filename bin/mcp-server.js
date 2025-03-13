#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

// Run the server
const serverPath = path.join(__dirname, '..', 'server.js');
const server = spawn('node', [serverPath], { stdio: 'inherit' });

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