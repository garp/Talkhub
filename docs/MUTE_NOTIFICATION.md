# Mute Notifications (Hashtag + Private Chatroom)

This document describes the **mute / unmute notification APIs** for:

- **Hashtags** (hashtag chat notifications)
- **Private chatrooms** (private message notifications)

All endpoints are **authenticated** and use `req.user.userId` (from `verifyToken`).

---

## Supported durations

`duration` (request body) supports:

- `8 hours` (also accepted: `8_hours`)
- `1 day` (also accepted: `1_day`)
- `always`

Server behavior:

- **8 hours**: mutes until now + 8 hours
- **1 day**: mutes until now + 24 hours
- **always**: permanent mute (until explicitly unmuted)

---

## Hashtag notification mute APIs

### Mute a hashtag

**POST** `/hashtag/:hashtagId/mute`

**Body**

```json
{
  "duration": "8 hours"
}
```

**Response (example)**

```json
{
  "message": "hashtag muted successfully",
  "hashtagId": "64f1c2e9d9c1c2e9d9c1c2e9",
  "duration": "8_hours",
  "mutedUntil": "2025-12-28T20:00:00.000Z",
  "isPermanent": false
}
```

### Unmute a hashtag

**POST** `/hashtag/:hashtagId/unmute`

No body. Uses `req.user.userId`.

**Response (example)**

```json
{
  "message": "hashtag unmuted successfully",
  "hashtagId": "64f1c2e9d9c1c2e9d9c1c2e9"
}
```

---

## Private chatroom notification mute APIs

### Mute a private chatroom

**POST** `/private-chatroom/:chatroomId/mute`

**Body**

```json
{
  "duration": "always"
}
```

**Response (example)**

```json
{
  "message": "private chatroom muted successfully",
  "chatroomId": "64f1c2e9d9c1c2e9d9c1c2e9",
  "duration": "always",
  "mutedUntil": null,
  "isPermanent": true
}
```

### Unmute a private chatroom

**POST** `/private-chatroom/:chatroomId/unmute`

No body. Uses `req.user.userId`.

**Response (example)**

```json
{
  "message": "private chatroom unmuted successfully",
  "chatroomId": "64f1c2e9d9c1c2e9d9c1c2e9"
}
```

---

## What “mute” currently suppresses

- **Hashtag mute**
  - Suppresses **in-app notifications** (`notificationService.create`) for hashtag chat messages
  - Suppresses **push notifications** (`sendHashtagMessageNotification`) for hashtag chat messages

- **Private chatroom mute**
  - Suppresses **push notifications** (`sendPrivateMessageNotification`) for private messages for that chatroom
  - Real-time socket message delivery is **not affected** (messages still arrive in-app)


