require('dotenv').config({
  path: `./.env.${process.env.NODE_ENV}`,
});

const admin = require('firebase-admin');
const serviceAccount = require('../lib/configs/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { connectDB } = require('../lib/helpers/connectDb');
const httpServer = require('./app');
const serverConfig = require('../lib/configs/server.config');
const { logInfo, logError } = require('../lib/helpers/logger');
const { cronJob } = require('./services/cron');

(async () => {
  try {
    // await connectRedis();
    await connectDB();
    httpServer.listen(serverConfig.PORT, async () => {
      logInfo(`Api Server is running at port : ${serverConfig.PORT}`);
      await cronJob();
    });
  } catch (err) {
    logError('Connection failed!', err.message);
  }
})();
