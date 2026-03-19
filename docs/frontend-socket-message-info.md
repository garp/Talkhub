# Socket: Get Message Info (Frontend Integration)

This document describes how to integrate the **messageInfo** socket flow to fetch full details for a single message (e.g. for a "message info" or "seen by" screen) in both **hashtag (public)** and **private/group** chats.

---
****
## Overview

| Purpose | Request one message’s full details (content, sender, read/delivery status, who saw it). |
|--------|-----------------------------------------------------------------------------------------|
| **Emit (client → server)** | `getMessageInfo` |
| **Listen (server → client)** | `messageInfoSuccess`, `messageInfoFailed` |
****
---

## 1. Socket event names

Use the same names as in `lib/constants/socket.js` (string values):

| Constant | Value (use this string) |
|----------|--------------------------|
| Request  | `GET_MESSAGE_INFO`       | `'getMessageInfo'`       |
| Success  | `MESSAGE_INFO_SUCCESS`   | `'messageInfoSuccess'`   |
| Failure  | `MESSAGE_INFO_FAILED`    | `'messageInfoFailed'`    |

---

## 2. Request payload (emit)

Emit **once** per message you want details for.

**Event:** `getMessageInfo`

**Payload:**

```ts
{
  messageId: string;   // MongoDB ObjectId of the message (24-char hex)
  chatType: 'hashtag' | 'private';
  chatroomId: string;  // MongoDB ObjectId of the chatroom (hashtag chatroom or private chatroom)
}
```

**Example (hashtag chat):**

```json
{
  "messageId": "67d8085f8325ec75637e0035",
  "chatType": "hashtag",
  "chatroomId": "67d8085f8325ec75637e0040"
}
```

**Example (private / group chat):**

```json
{
  "messageId": "67d8085f8325ec75637e0035",
  "chatType": "private",
  "chatroomId": "67e1234567890abcdef12345"
}
```

- `messageId`: ID of the message you’re opening “info” for.
- `chatType`: `"hashtag"` for public hashtag chat, `"private"` for DM/group.
- `chatroomId`: ID of the room that message belongs to (same as in `MESSAGE_HISTORY` / `PRIVATE_MESSAGE_HISTORY`).

---

## 3. Success response (listen)

**Event:** `messageInfoSuccess`

**Payload:**

```ts
{
  message: {
    _id: string;
    chatroomId: string;
    senderId: string;
    senderDetails: {
      _id: string;
      fullName: string;
      userName: string;
      profilePicture: string | null;
    } | null;
    content: string;
    messageType: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file' | 'poll' | 'sharedcontent';
    media?: string;
    location?: { latitude: number; longitude: number; address?: string };
    poll?: object;  // poll definition (no correctOptionId for quiz)
    status: 'sent' | 'delivered' | 'read';
    readBy: Array<{
      userId: string;
      readAt?: string;   // ISO date
      user: {
        _id: string;
        fullName: string;
        userName: string;
        profilePicture: string | null;
      } | null;
    }>;
    deliveredTo: Array<{
      userId: string;
      deliveredAt?: string;  // ISO date
      user: {
        _id: string;
        fullName: string;
        userName: string;
        profilePicture: string | null;
      } | null;
    }>;
    createdAt: string;   // ISO date
    updatedAt: string;   // ISO date
    isEdited: boolean;
    editedAt?: string;
    isDeleted: boolean;
    deletedBy?: string;
    deletedAt?: string;
    chatType: 'hashtag' | 'private';
  };
}
```

- **`readBy`** / **`deliveredTo`**: Each entry includes `userId`, timestamp (`readAt` / `deliveredAt`), and a **`user`** object (fullName, userName, profilePicture) so you can show “Seen by John, Jane, …” without extra lookups.
- **`senderDetails`**: Use for the sender row (name, avatar).
- **`status`**: `sent` | `delivered` | `read` for ticks/badges.
- **`chatType`**: Echo of what you sent; use to know hashtag vs private UI.

---

## 4. Error response (listen)

**Event:** `messageInfoFailed`

**Payload:**

```ts
{
  message: string;  // Human-readable error, e.g. "Message not found.", "You are not a participant of this chat."
}
```

Common cases:

- Missing/invalid `messageId`, `chatType`, or `chatroomId`.
- `chatType` not `"hashtag"` or `"private"`.
- User not in the room (not a participant).
- Message not in that chatroom or deleted → “Message not found.”

---

## 5. Integration steps (frontend)

1. **Connect** the socket with your auth (e.g. `userId` in handshake query) so the server can authorize the request.

2. **Emit** when the user opens “message info” (e.g. long-press → “Info” or “Seen by”):
   - Event: `getMessageInfo`
   - Data: `{ messageId, chatType, chatroomId }` (you already have these from the message list).

3. **Listen** for responses:
   - `messageInfoSuccess` → show the `message` object (sender, content, `readBy`, `deliveredTo`, status).
   - `messageInfoFailed` → show `payload.message` and optionally retry or close.

4. **UI suggestions:**
   - Use `message.senderDetails` for the sender row.
   - Use `message.readBy[].user` to show “Seen by: Avatar, Name, …” and `readAt` for “Seen at …”.
   - Use `message.deliveredTo` similarly for “Delivered to …”.
   - Use `message.status` for single/double tick or “Delivered”/“Read” labels.

---

## 6. Minimal code example (pseudo)

```js
// Emit request
socket.emit('getMessageInfo', {
  messageId: selectedMessage._id,
  chatType: isHashtagChat ? 'hashtag' : 'private',
  chatroomId: currentChatroomId,
});

// Listen success
socket.on('messageInfoSuccess', (payload) => {
  const { message } = payload;
  setMessageInfo(message);
  setReadBy(message.readBy);      // list with user + readAt
  setDeliveredTo(message.deliveredTo);
});

// Listen failure
socket.on('messageInfoFailed', (payload) => {
  showToast(payload.message);
});
```

---

## 7. Summary

| Step | Event / Action | Payload |
|------|----------------|--------|
| Request | **Emit** `getMessageInfo` | `{ messageId, chatType, chatroomId }` |
| Success | **On** `messageInfoSuccess` | `{ message }` (full details + enriched readBy/deliveredTo) |
| Failure | **On** `messageInfoFailed` | `{ message: string }` |

The server ensures the user is a participant of the given chatroom before returning message details. Use the same `chatroomId` and `messageId` you have from your existing message list (e.g. from `messageHistory` or `privateMessageHistory`).
