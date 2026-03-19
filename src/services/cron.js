// cron.js
const nodeCron = require('node-cron');
const createSpinner = require('../../lib/helpers/spinner');
const chatroomService = require('./chatroomServices');
const storiesServices = require('./storiesServices');
const { chatRoomWithMessageArray } = require('../queries/chatrooms.queries');
const { chatgptSummarizeChatApi } = require('../../lib/helpers/ai');
const notificationService = require('./notificationService');
const participantServices = require('./participantServices');
const chatSummaryServices = require('./chatSummaryServices');
const { logError } = require('../../lib/helpers/logger');
const mediaModerationService = require('./mediaModerationService');

const utcDateKey = (d = new Date()) => {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

exports.cronJob = async () => {
  const spinner = createSpinner('[cron] initializing…');

  // Media moderation worker:
  // - runs frequently to avoid blocking uploads/posts/messages
  // - stores "why banned" in mediaAssets and also denormalizes to posts/messages
  nodeCron.schedule('*/1 * * * *', async () => {
    try {
      await mediaModerationService.processPendingMediaAssets({ limit: 10 });
    } catch (error) {
      logError('[cron] media moderation (pending) error:', error.message || error);
    }
  });

  nodeCron.schedule('*/2 * * * *', async () => {
    try {
      await mediaModerationService.processInProgressVideoModeration({ limit: 5 });
    } catch (error) {
      logError('[cron] media moderation (video poll) error:', error.message || error);
    }
  });

  // Daily cron job for chatroom summaries - runs at midnight every day
  nodeCron.schedule('0 0 * * *', async () => {
    try {
      spinner.start();

      spinner.text = '[cron] fetching chatrooms…';
      const dateKey = utcDateKey(new Date());

      const summarizeOne = async ({
        chatroomType,
        chatroomId,
        prompt,
        recipientIds,
        meta = {},
      }) => {
        if (!prompt || !prompt.length) return { status: 'skipped', reason: 'empty_prompt', chatroomId };
        if (!chatroomId) return { status: 'skipped', reason: 'no_chatroom_id' };

        const ai = await chatgptSummarizeChatApi(prompt, chatroomId);
        if (!ai || !ai.summary) return { status: 'failed', reason: 'no_summary', chatroomId };

        // Upsert chat-summary doc (one per room per day)
        const summaryDoc = await chatSummaryServices.findOneAndUpsert({
          filter: { chatroomType, chatroomId, dateKey },
          body: {
            $set: {
              chatroomType,
              chatroomId,
              dateKey,
              summary: ai.summary,
              meta: {
                ...meta,
                generatedBy: 'chatgptSummarizeChatApi',
                usage: ai.usage || null,
                createdAt: new Date().toISOString(),
              },
            },
          },
        });

        const summaryId = summaryDoc && summaryDoc._id ? summaryDoc._id : null;

        await Promise.allSettled(
          (recipientIds || []).map((rid) => notificationService.create({
            body: {
              userId: rid,
              chatroomId,
              category: 'ai',
              type: 'ai_summary',
              summary: ai.summary,
              meta: {
                ...meta,
                summaryId,
                chatroomType,
                dateKey,
              },
            },
          })),
        );

        return { status: 'ok', chatroomId };
      };

      // Hashtag chatrooms only (no private chatroom AI summaries)
      const query = chatRoomWithMessageArray();
      const { formattedMessages = [], data = [] } = await chatroomService.aggreateMessage({ query });

      if (!Array.isArray(formattedMessages) || formattedMessages.length === 0) {
        spinner.warn('[cron] no hashtag chatroom prompts found');
      }

      const total = formattedMessages.length || 0;
      let ok = 0; let failed = 0; let skipped = 0;
      spinner.text = `[cron] summarizing ${total} hashtag chatroom(s)… ok=${ok} failed=${failed} skipped=${skipped}`;

      const hashtagTasks = (formattedMessages || []).map(async (messageData, index) => {
        try {
          const chatroomId = messageData.chatroomId || (data[index] && data[index]._id) || null;
          const participants = await participantServices.find({
            filter: { chatroomId },
            projection: { userId: 1 },
          });
          const recipientIds = (participants || []).map((p) => p.userId).filter(Boolean);
          const result = await summarizeOne({
            chatroomType: 'hashtag',
            chatroomId,
            prompt: messageData.prompt,
            recipientIds,
            meta: { source: 'hashtag_chatroom' },
          });

          if (result.status === 'ok') ok++;
          else if (result.status === 'failed') failed++;
          else skipped++;
          spinner.text = `[cron] summarizing ${total}… ok=${ok} failed=${failed} skipped=${skipped}`;
          return { index, ...result };
        } catch (err) {
          failed++;
          spinner.text = `[cron] summarizing ${total}… ok=${ok} failed=${failed} skipped=${skipped}`;
          return { index, status: 'failed', reason: err.message || 'unknown' };
        }
      });

      await Promise.allSettled(hashtagTasks);

      spinner.succeed(`[cron] completed. ok=${ok} failed=${failed} skipped=${skipped}`);
    } catch (error) {
      logError('[cron] fatal error:', error.message || error);
    }
  });

  // Hourly cron job to expire stories - runs every hour
  // COMMENTED OUT: Stories with isHighlight: false will no longer be auto-expired
  // Expire stories frequently (keeps story feed accurate without requiring TTL deletes).
  nodeCron.schedule('*/10 * * * *', async () => {
    try {
      const storySpinner = createSpinner('[cron] expiring stories…');
      storySpinner.start();

      const result = await storiesServices.expireStories({ now: new Date() });
      const modified = result && (result.modifiedCount ?? result.nModified ?? 0);

      storySpinner.succeed(`[cron] stories expired: ${modified}`);
    } catch (error) {
      logError('[cron] error expiring stories:', error.message || error);
    }
  });
};
