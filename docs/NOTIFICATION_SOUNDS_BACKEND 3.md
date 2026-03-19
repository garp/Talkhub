# Notification Sounds - Backend Integration Guide

This document outlines the backend changes required to support custom notification sounds in the TalkHub mobile app.

## ⚠️ IMPORTANT: Sound Rules by App State

Use different behavior for foreground vs background:

- **App open (foreground):** App JS plays custom sound (`expo-av`).
- **App background/closed (iOS):** iOS can only play sound from APNs payload (`aps.sound`).

So the backend must include `aps.sound` for iOS delivery, otherwise closed/background notifications will be silent.

## Overview

The TalkHub app now supports two distinct notification sounds:
1. **Message Sound** (`TalkHub_Pop_message.mp3`) - For chat messages (public & private)
2. **Notification Sound** (`TalkHub_Pop_notification.mp3`) - For general notifications (likes, comments, follows, etc.)

## Push Notification Payload Requirements

### 1. iOS Must Include APNs Sound

For iOS notifications, include `aps.sound` with your custom bundled file name.
Use file names that exist in the iOS app bundle.

Without `aps.sound`, iOS background/closed notifications are silent.

### 2. Include Notification Type

Every push notification payload MUST include a `type` field in the `data` object to differentiate between message and other notifications.

**Supported types for MESSAGE sound:**
- `message`
- `chat`
- `private_message`
- `public_message`

**All other types will play the GENERAL notification sound.**

### 3. iOS (APNs) Payload Format

Include `aps.sound` so background/closed iOS notifications play sound.

#### Message Notifications
```json
{
  "aps": {
    "alert": {
      "title": "New Message from John",
      "body": "Hey, how are you?"
    },
    "sound": "TalkHub_Pop_message.mp3",
    "badge": 1,
    "mutable-content": 1
  },
  "data": {
    "type": "message",
    "chatroomId": "abc123",
    "senderId": "user456"
  }
}
```

#### General Notifications (likes, comments, follows, etc.)
```json
{
  "aps": {
    "alert": {
      "title": "New Like",
      "body": "John liked your post"
    },
    "sound": "TalkHub_Pop_notification.mp3",
    "badge": 1,
    "mutable-content": 1
  },
  "data": {
    "type": "like",
    "postId": "post123",
    "userId": "user456"
  }
}
```

### 4. Android (FCM) Payload Format

For Android background/closed notifications with custom sound, backend must send:
- `android.notification.channelId` (`messages` or `general`)
- `android.notification.sound` matching channel sound resource

#### Message Notifications
```json
{
  "message": {
    "token": "device_token_here",
    "notification": {
      "title": "New Message from John",
      "body": "Hey, how are you?"
    },
    "android": {
      "notification": {
        "channelId": "messages",
        "sound": "talkhub_pop_message"
      }
    },
    "data": {
      "type": "message",
      "chatroomId": "abc123",
      "senderId": "user456"
    }
  }
}
```

#### General Notifications
```json
{
  "message": {
    "token": "device_token_here",
    "notification": {
      "title": "New Like",
      "body": "John liked your post"
    },
    "android": {
      "notification": {
        "channelId": "general",
        "sound": "talkhub_pop_notification"
      }
    },
    "data": {
      "type": "like",
      "postId": "post123",
      "userId": "user456"
    }
  }
}
```

## Notification Types Reference

| Notification Type | Sound File | data.type Values |
|-------------------|------------|------------------|
| Chat Messages | `talkhub_pop_message` | `message`, `chat`, `private_message`, `public_message` |
| Likes | `talkhub_pop_notification` | `like`, `post_like` |
| Comments | `talkhub_pop_notification` | `comment`, `post_comment` |
| Follows | `talkhub_pop_notification` | `follow`, `new_follower` |
| Story Views | `talkhub_pop_notification` | `story_view`, `story_reaction` |
| Mentions | `talkhub_pop_notification` | `mention`, `tag` |
| Other | `talkhub_pop_notification` | Any other value |

## Sound File Locations

### iOS
Sound files are bundled in the app at build time:
- `/assets/sounds/TalkHub_Pop_message.mp3`
- `/assets/sounds/TalkHub_Pop_notification.mp3`

### Android
Sound files are located in:
- `/android/app/src/main/res/raw/talkhub_pop_message.mp3`
- `/android/app/src/main/res/raw/talkhub_pop_notification.mp3`

**Important:** Android requires:
- Lowercase filenames
- Underscores instead of spaces/special characters
- No file extension in the payload

## Backend Code Example (Node.js with Firebase Admin)

```javascript
const admin = require('firebase-admin');

// Function to send push notification
// iOS needs aps.sound for background/closed app sound.
async function sendPushNotification({ token, title, body, type, data }) {
  const isMessageType = ['message', 'chat', 'private_message', 'public_message'].includes(type);
  const channelId = isMessageType ? 'messages' : 'general';
  const iosSound = isMessageType
    ? 'TalkHub_Pop_message.mp3'
    : 'TalkHub_Pop_notification.mp3';
  const androidSound = isMessageType ? 'talkhub_pop_message' : 'talkhub_pop_notification';

  const message = {
    token: token,
    notification: {
      title: title,
      body: body,
    },
    apns: {
      payload: {
        aps: {
          // Required for iOS background/closed sound.
          sound: iosSound,
          badge: 1,
          'mutable-content': 1,
        },
      },
    },
    android: {
      notification: {
        channelId: channelId,
        sound: androidSound,
      },
    },
    data: {
      type: type, // REQUIRED: App uses this to determine which sound to play
      ...data,
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent notification:', response);
    return response;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

// Usage examples:

// For chat message - type: 'message' will trigger message sound in app
await sendPushNotification({
  token: 'user_device_token',
  title: 'New Message from John',
  body: 'Hey, how are you?',
  type: 'message', // This triggers message sound
  data: {
    chatroomId: 'abc123',
    senderId: 'user456',
  },
});

// For like notification - type: 'like' will trigger general notification sound in app
await sendPushNotification({
  token: 'user_device_token',
  title: 'New Like',
  body: 'John liked your post',
  type: 'like', // This triggers notification sound
  data: {
    postId: 'post123',
    userId: 'user456',
  },
});
```

## Testing

1. **In-App Testing (App Open):**
   - App plays sound via JS (`onMessage`) and local sound files.
   - Keep `expo-notifications` foreground handler with `shouldPlaySound: false` to avoid double sound.

2. **Push Notification Testing (App in Background/Closed):**
   - Send test notifications with both `data.type` and `aps.sound` (iOS).
   - Verify correct iOS sound plays when app is backgrounded or terminated.

3. **Test Cases:**
   - [ ] Message notification plays `talkhub_pop_message` sound
   - [ ] Like notification plays `talkhub_pop_notification` sound
   - [ ] Comment notification plays `talkhub_pop_notification` sound
   - [ ] Follow notification plays `talkhub_pop_notification` sound
   - [ ] Sound works on iOS
   - [ ] Sound works on Android

## Notes

- Sound files are approximately 2 seconds each
- iOS may require app rebuild if sound files change
- Android notification channels should be configured in the app for proper sound handling
- If `type` is missing or unrecognized, the general notification sound will play
- iOS custom push sounds should use bundled `.caf`/`.wav`/`.aiff` files.
- Android channel sound is immutable after first creation. If sound mapping changes, uninstall/reinstall app or use new channel IDs.

## Questions?

Contact the mobile development team for any clarification on sound file specifications or notification payload format.
