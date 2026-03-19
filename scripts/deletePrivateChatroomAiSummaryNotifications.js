/**
 * One-time script: delete all notifications that are AI summaries for private chatrooms.
 * AI summaries are now generated for hashtag chatrooms only.
 *
 * Usage: node scripts/deletePrivateChatroomAiSummaryNotifications.js
 */

require('dotenv').config({ path: '.env.dev' });

const mongoose = require('mongoose');
const notificationService = require('../src/services/notificationService');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  if (!MONGO_URI) {
    console.error('Missing MONGO_URI or MONGODB_URI in environment');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const filter = {
    type: 'ai_summary',
    'meta.chatroomType': 'private',
  };

  const result = await notificationService.deleteMany({ filter });
  const deletedCount = result?.deletedCount ?? 0;
  console.log(`Deleted ${deletedCount} private chatroom AI summary notification(s).`);

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
