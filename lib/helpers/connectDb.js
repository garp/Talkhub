const mongoose = require('mongoose');
const { mongoUri, mongoOptions } = require('../configs/db.config');
const User = require('../../src/models/user.model');
const Hashtag = require('../../src/models/hashtag.model');
const PrivateChatroom = require('../../src/models/privateChatroom.model');
const WaitlistRequest = require('../../src/models/waitlistRequest.model');
const { logError, logInfo } = require('./logger');

async function createIndex() {
  try {
    await User.createIndexes();
    await Hashtag.createIndexes();
    // One-time: drop legacy unique index on participantSetKey so multiple groups can have same participants (different names)
    try {
      await PrivateChatroom.collection.dropIndex('participantSetKey_1');
      logInfo('Dropped legacy unique index participantSetKey_1');
    } catch (dropErr) {
      if (dropErr.code !== 27 && dropErr.codeName !== 'IndexNotFound') {
        logError('Error dropping participantSetKey index:', dropErr);
      }
    }
    await PrivateChatroom.createIndexes();

    // Drop legacy non-sparse unique indexes on waitlistRequests that reject null duplicates
    try {
      await WaitlistRequest.collection.dropIndex('reservedUsername_1');
      logInfo('Dropped legacy waitlist index reservedUsername_1');
    } catch (dropErr) {
      if (dropErr.code !== 27 && dropErr.codeName !== 'IndexNotFound') {
        logError('Error dropping waitlist index reservedUsername_1:', dropErr);
      }
    }
    try {
      await WaitlistRequest.collection.dropIndex('email_1');
      logInfo('Dropped legacy waitlist index email_1');
    } catch (dropErr) {
      if (dropErr.code !== 27 && dropErr.codeName !== 'IndexNotFound') {
        logError('Error dropping waitlist index email_1:', dropErr);
      }
    }
    await WaitlistRequest.createIndexes();
  } catch (error) {
    logError('Error creating indexes:', error);
  }
}
exports.connectDB = async () => {
  logInfo('Connecting to MongoDB...');
  await mongoose.connect(mongoUri, mongoOptions);
  createIndex();
  logInfo('MongoDB connected !!');
};
