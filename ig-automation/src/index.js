'use strict';
require('dotenv').config();

const http = require('http');
const logger = require('./utils/logger');
const { startPoller } = require('./poller');

const PORT = process.env.PORT || 8080;

// Minimal health-check server — Cloud Run requires a listening port
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK\n');
});

server.listen(PORT, () => {
  logger.info(`Health server listening on port ${PORT}`);
  startPoller().catch(err => {
    logger.error('Poller crashed', { err: err.message, stack: err.stack });
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
