const express = require('express');
const cors = require('cors');
const morganBody = require('morgan-body');
const path = require('path');

const app = express();
const { createServer } = require('http');
const { Server } = require('socket.io');
const { initializeSocketIO } = require('./events/index');
const Routes = require('./routes/index.routes');
const { logInfo } = require('../lib/helpers/logger');
const corsConfig = require('../lib/configs/cors.config');

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsConfig,
});
app.set('io', io);

// Enable CORS for all routes
app.use(cors(corsConfig));

initializeSocketIO(io);
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

morganBody(app);
app.use('/', Routes);

// Handle invalid JSON bodies (e.g. Content-Type: application/json with empty/malformed JSON)
// so the API returns a clean 400 instead of an unhandled stack trace.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  return next(err);
});

app.get('/health-check', (req, res) => {
  logInfo('Health check passed!');
  res.send('Hello World!');
});

module.exports = httpServer;
