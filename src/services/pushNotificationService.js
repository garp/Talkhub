const admin = require('firebase-admin');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const { logInfo } = require('../../lib/helpers/logger');

const MESSAGE_TYPES = ['message', 'chat', 'private_message', 'group_message', 'public_message'];

const isMessageType = (type) => MESSAGE_TYPES.includes(String(type || '').toLowerCase());

/**
 * FCM "data" payload must be string values. Convert common primitives,
 * and JSON.stringify objects/arrays.
 */
const normalizeDataPayload = (data = {}) => {
  const out = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v === undefined) return;
    if (v === null) {
      out[k] = '';
      return;
    }
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else out[k] = JSON.stringify(v);
  });
  return out;
};

/**
 * Build a push notification message with correct channel and sound based on type.
 *
 * Sound strategy (per NOTIFICATION_SOUNDS_BACKEND doc):
 * - App FOREGROUND: App JS plays custom sound via expo-av. The app's foreground
 *   handler sets shouldPlaySound: false to avoid double sounds.
 * - App BACKGROUND / CLOSED (iOS): iOS can ONLY play sound from the APNs payload
 *   (aps.sound). Without it, background/closed notifications are completely silent.
 *   We set aps.sound to the bundled custom sound file so iOS plays the correct
 *   sound even when the app is closed.
 * - Android: Sound is managed by notification channels. channelId is set to
 *   "messages" (message types) or "general" (everything else). The android
 *   notification.sound field matches the channel's configured sound resource.
 *
 * Supported message types (play message sound):
 *   message, chat, private_message, public_message
 * All other types play the general notification sound.
 */
const buildPushMessage = ({
  fcmToken,
  title,
  body,
  type,
  data = {},
  imageUrl = null,
}) => {
  const msgType = String(type || '').toLowerCase();
  const messageSound = isMessageType(msgType);

  // Android channel: "messages" for chat types, "general" for everything else
  const channelId = messageSound ? 'messages' : 'general';

  // iOS: bundled custom sound file name (with extension)
  const iosSound = messageSound
    ? 'TalkHub_Pop_message.mp3'
    : 'TalkHub_Pop_notification.mp3';

  // Android: sound resource name (lowercase, no extension)
  const androidSound = messageSound
    ? 'talkhub_pop_message'
    : 'talkhub_pop_notification';

  const message = {
    token: fcmToken,
    notification: {
      title: title || '',
      body: body || '',
    },
    data: normalizeDataPayload({
      type: msgType || 'notification', // REQUIRED: App uses this to determine which sound to play
      ...data,
    }),
    apns: {
      payload: {
        aps: {
          // Required for iOS background/closed notifications to play sound.
          // Uses bundled custom sound file; the app's foreground handler
          // suppresses this when the app is open (shouldPlaySound: false).
          sound: iosSound,
          badge: 1,
          'mutable-content': 1,
        },
      },
    },
    android: {
      notification: {
        channelId,
        sound: androidSound,
      },
    },
  };

  // Optional rich image support (keeps existing behavior)
  if (imageUrl) {
    message.notification.imageUrl = imageUrl;
    message.android.notification.imageUrl = imageUrl;
    message.apns.fcm_options = { image: imageUrl };
  }

  return message;
};

exports.pushNotication = async (req, res) => {
  try {
    const {
      fcmToken,
      title = 'This is a test notification',
      body = 'This is a test notification',
      type = 'notification',
      data = {},
      imageUrl = null,
    } = req.body || {};

    const message = buildPushMessage({
      fcmToken,
      title,
      body,
      type,
      data,
      imageUrl,
    });
    await admin.messaging().send(message);
    return responseHandler(
      {
        message: 'Notification sent successfully',
      },
      res,
    );
  } catch (error) {
    return errorHandler('ERR-004', res);
  }
};

exports.sendPrivateMessageNotification = async ({
  fcmToken,
  title,
  body,
  // Backward compatible: existing call sites don't pass type/data; we default to private_message.
  type = 'private_message',
  data = {},
  imageUrl = null,
}) => {
  try {
    if (!fcmToken) {
      return { success: false, error: 'No FCM token provided' };
    }

    const message = buildPushMessage({
      fcmToken,
      title,
      body,
      type,
      data,
      imageUrl,
    });
    const res = await admin.messaging().send(message);
    logInfo(`Notification sent to ${fcmToken} successfully`);
    return { success: true, response: res };
  } catch (error) {
    logInfo(`Failed to send notification to ${fcmToken}: ${error.message}`);
    return { success: false, error: error.message };
  }
};

exports.sendHashtagMessageNotification = async ({
  fcmToken,
  title,
  body,
  imageUrl,
  hashtagId,
  chatroomId,
  chatName,
  chatProfilePicture,
  senderId,
  messageId,
}) => {
  try {
    if (!fcmToken) {
      return { success: false, error: 'No FCM token provided' };
    }

    const message = buildPushMessage({
      fcmToken,
      title,
      body,
      type: 'public_message',
      data: {
        hashtagId: hashtagId ? hashtagId.toString() : '',
        chatroomId: chatroomId ? chatroomId.toString() : '',
        chatName: chatName || '',
        chatProfilePicture: chatProfilePicture || '',
        senderId: senderId ? senderId.toString() : '',
        messageId: messageId ? messageId.toString() : '',
      },
      imageUrl: imageUrl || null,
    });

    const res = await admin.messaging().send(message);
    logInfo(`Hashtag notification sent to ${fcmToken} successfully`);
    return { success: true, response: res };
  } catch (error) {
    logInfo(`Failed to send hashtag notification to ${fcmToken}: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification when a user is mentioned in a post
 * @param {string} fcmToken - The recipient's FCM token
 * @param {string} mentionedByName - Name of the user who mentioned them
 * @param {string} postPreview - Preview of the post text (truncated)
 * @param {string} postId - The post ID for deep linking
 */
exports.sendMentionNotification = async ({
  fcmToken,
  mentionedByName,
  postPreview,
  postId,
  userId,
}) => {
  try {
    if (!fcmToken) {
      return { success: false, error: 'No FCM token provided' };
    }

    const title = 'You were mentioned in a post';
    const body = `${mentionedByName} mentioned you: "${postPreview}"`;

    const message = buildPushMessage({
      fcmToken,
      title,
      body,
      type: 'mention',
      data: {
        postId: postId ? postId.toString() : '',
        userId: userId ? userId.toString() : '',
      },
    });
    const res = await admin.messaging().send(message);
    logInfo(`Mention notification sent to ${fcmToken} successfully`);
    return { success: true, response: res };
  } catch (error) {
    logInfo(`Failed to send mention notification to ${fcmToken}: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send mention notifications to multiple users in batch
 * @param {Array} mentions - Array of { fcmToken, mentionedByName, postPreview, postId }
 */
exports.sendBatchMentionNotifications = async (mentions) => {
  const results = await Promise.allSettled(
    mentions.map((mention) => exports.sendMentionNotification(mention)),
  );

  const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - successful;

  logInfo(`Batch mention notifications: ${successful} sent, ${failed} failed`);

  return { successful, failed, total: results.length };
};

/**
 * Send push notification when a user the recipient follows posts a new story.
 * @param {string} fcmToken - The recipient's FCM token
 * @param {string} ownerName - Display name of the story owner
 * @param {string} ownerId - The story owner's user ID (for deep linking)
 * @param {string} storyId - The new story's ID (for deep linking)
 * @param {string} [thumbnailUrl] - Optional thumbnail for rich notification
 */
exports.sendStoryNotification = async ({
  fcmToken,
  ownerName,
  ownerId,
  storyId,
  thumbnailUrl,
}) => {
  try {
    if (!fcmToken) {
      return { success: false, error: 'No FCM token provided' };
    }

    const title = `${ownerName} posted a new story`;
    const body = 'Tap to view their story';

    const message = buildPushMessage({
      fcmToken,
      title,
      body,
      type: 'new_story',
      data: {
        ownerId: ownerId ? ownerId.toString() : '',
        storyId: storyId ? storyId.toString() : '',
      },
      imageUrl: thumbnailUrl || null,
    });
    const res = await admin.messaging().send(message);
    logInfo(`Story notification sent to ${fcmToken} successfully`);
    return { success: true, response: res };
  } catch (error) {
    logInfo(`Failed to send story notification to ${fcmToken}: ${error.message}`);
    return { success: false, error: error.message };
  }
};
