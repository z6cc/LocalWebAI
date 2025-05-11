const express = require('express');
const http = require('http');
const app = express();

const host = '0.0.0.0';
const port = 8080;

// Middleware to set required headers for SharedArrayBuffer access
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Serve static files from the current directory ('.')
app.use(express.static('.'));

// Create an HTTP server
const httpServer = http.createServer(app);

httpServer.listen(port, host, () => {
  console.log(`HTTP server listening at http://${host}:${port}`);
});
