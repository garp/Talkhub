# Private Chatroom — Exit / Removed User Integration Guide

## Overview

When a user **leaves** a private group chat or is **removed by an admin**, the server now tracks the reason and surfaces it in the `joinPrivateRoom` socket flow. The frontend should use this to:

1. **Show messages only up to the time the user left/was removed** (server handles this).
2. **Show a system message** at the bottom of the chat (e.g. "You left the chat" or "You were removed by John").
3. **Disable the message input / keyboard** so the user cannot send new messages.

---

## Socket Events

### 1. `joinPrivateRoom` (client → server)

No payload changes. Send as before:

```json
{
  "chatroomId": "<chatroom ObjectId>",
  "page": 1,
  "limit": 20
}
```

### 2. `userJoinedPrivateChat` (server → client, to self)

The server emits this to the joining user. **New fields:**

```json
{
  "message": "You have joined the chatroom.",
  "isPresent": false,
  "exitInfo": {
    "reason": "left" | "removed",
    "exitedAt": "2026-03-07T12:00:00.000Z",
    "systemMessage": "You left the chat" | "You were removed by John Doe",
    "removedByUser": {
      "_id": "...",
      "fullName": "John Doe",
      "userName": "johndoe",
      "profilePicture": "https://..."
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `isPresent` | `boolean` | `true` = active participant (can send messages). `false` = left or removed. |
| `exitInfo` | `object \| undefined` | Present only when `isPresent` is `false`. |
| `exitInfo.reason` | `"left" \| "removed"` | Why the user is no longer present. |
| `exitInfo.exitedAt` | `string (ISO date)` | Timestamp when the user left or was removed. |
| `exitInfo.systemMessage` | `string` | Ready-to-display system message text. |
| `exitInfo.removedByUser` | `object \| undefined` | Admin who removed the user (only when `reason === "removed"`). |

### 3. `privateMessageHistory` (server → client)

Contains message history. **New fields added at the top level:**

```json
{
  "chatroomId": "...",
  "isPresent": false,
  "exitInfo": { ... },
  "metadata": { "totalMessages": 50, "totalPages": 3, "page": 1, "limit": 20 },
  "messages": [ ... ],
  "timeline": [ ... ]
}
```

- `isPresent` and `exitInfo` are the same as in `userJoinedPrivateChat`.
- **Messages are capped:** only messages created at or before `exitedAt` are returned. Messages sent after the user left/was removed are not included.

### 4. `timeline` array — system message entry

When `isPresent === false` and `page === 1`, the server appends a **system message** at the end of the `timeline` array:

```json
{
  "type": "system",
  "messageType": "system",
  "content": "You left the chat",
  "reason": "left",
  "createdAt": "2026-03-07T12:00:00.000Z"
}
```

Or for removed users:

```json
{
  "type": "system",
  "messageType": "system",
  "content": "You were removed by John Doe",
  "reason": "removed",
  "removedByUser": {
    "_id": "...",
    "fullName": "John Doe",
    "userName": "johndoe",
    "profilePicture": "https://..."
  },
  "createdAt": "2026-03-07T12:00:00.000Z"
}
```

---

## Frontend Implementation Steps

### 1. Handle `isPresent` from `userJoinedPrivateChat`

```javascript
socket.on('userJoinedPrivateChat', (payload) => {
  if (payload.isPresent === false) {
    // Disable message input / keyboard
    disableMessageInput();

    // Optionally store exitInfo for UI display
    setExitInfo(payload.exitInfo);
  } else {
    enableMessageInput();
  }
});
```

### 2. Render system message in timeline

When rendering the `timeline` array from `privateMessageHistory`, check for `type === 'system'`:

```javascript
timeline.forEach((entry) => {
  if (entry.type === 'date') {
    renderDateSeparator(entry.label);
  } else if (entry.type === 'system') {
    renderSystemMessage(entry.content);
    // entry.content is ready-to-display text:
    //   "You left the chat"
    //   "You were removed by John Doe"
  } else if (entry.type === 'message') {
    renderMessage(entry);
  }
});
```

### 3. Disable keyboard / input

When `isPresent === false`:

- Hide or disable the message composer / text input.
- Optionally show a banner at the bottom:
  - If `exitInfo.reason === 'left'`: **"You left this group"**
  - If `exitInfo.reason === 'removed'`: **"You were removed from this group"**

### 4. System message UI styling

The system message (`type: 'system'`) should be rendered as a centered, gray bubble (similar to WhatsApp's "You left" / "X removed you" messages). It is **not** a regular chat message.

---

## Edge Cases

| Scenario | `isPresent` | `exitInfo.reason` | Keyboard | Messages shown |
|----------|-------------|-------------------|----------|----------------|
| Active participant | `true` | N/A | Enabled | All messages (respecting clearedAt) |
| User left voluntarily | `false` | `"left"` | Disabled | Only up to `exitedAt` + system message |
| User removed by admin | `false` | `"removed"` | Disabled | Only up to `exitedAt` + system message with admin name |
| User not in chat at all | Error | N/A | N/A | `privateChatJoinFailed` emitted |

---

## Server-Side Enforcement

Even if the client ignores `isPresent` and tries to send a message via `sendPrivateMessage`, the server will reject it with:

```json
{
  "message": "You cannot send messages in this chat. You have left or were removed."
}
```

emitted via `sendPrivateMessageFailed`.

---

## DB Schema Reference (exParticipants)

Each entry in `privateChatrooms.exParticipants`:

```
{
  userId:    ObjectId  (the user who left/was removed)
  exitedAt:  Date      (when they left/were removed)
  reason:    "left" | "removed"
  removedBy: ObjectId | null  (admin who removed them; null for voluntary leave)
}
```
