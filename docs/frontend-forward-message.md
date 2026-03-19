# Forward Message Feature (Frontend Integration)

This document describes how to integrate **forward message** in both **hashtag (public)** and **private/group** chats. The server stores whether a message was forwarded and whether it was forwarded multiple times (e.g. “Forwarded” vs “Forwarded many times” labels).

---

## Overview

| Purpose | Send a message as a forward and show “Forwarded” / “Forwarded many times” in the UI. |
|--------|--------------------------------------------------------------------------------------|
| **Where** | Hashtag chat: `sendMessage` · Private/group chat: `sendPrivateMessage` |
| **New payload fields** | `forward` (boolean), `isMultipleTimesForwarded` (boolean, optional) |
| **Response / history** | Every message includes `isForwarded` and `isMultipleTimesForwarded` |

---

## 1. Model fields (stored in DB)

Each message (hashtag and private) has:

| Field | Type | Default | Description |
|-------|------|--------|-------------|
| `isForwarded` | `boolean` | `false` | `true` when the message was sent as a forward. |
| `isMultipleTimesForwarded` | `boolean` | `false` | `true` when the forwarded message was itself already a forward (e.g. “Forwarded many times”). |

The frontend does **not** set these directly; the server sets them from the socket payload (see below).

---

## 2. Hashtag chat – send message

**Event:** `sendMessage`

**Payload (relevant fields):**

```ts
{
  hashtagId: string;
  content?: string;
  media?: string;
  // ... other existing fields (parentMessageId, messageType, location, poll, etc.) ...

  /** Set to true when the user is forwarding a message. */
  forward?: boolean;

  /** Set to true when forwarding a message that was already forwarded (shows "Forwarded many times"). Omit or false otherwise. */
  isMultipleTimesForwarded?: boolean;
}
```

**Examples:**

- Normal message (not a forward):
  ```json
  { "hashtagId": "...", "content": "Hello" }
  ```
  → `isForwarded: false`, `isMultipleTimesForwarded: false`

- Forwarded message (first-time forward):
  ```json
  { "hashtagId": "...", "content": "Hello", "forward": true }
  ```
  → `isForwarded: true`, `isMultipleTimesForwarded: false`

- Forwarded message that was already forwarded:
  ```json
  { "hashtagId": "...", "content": "Hello", "forward": true, "isMultipleTimesForwarded": true }
  ```
  → `isForwarded: true`, `isMultipleTimesForwarded: true`

**Server behavior:**

- `forward === true` → message is stored with `isForwarded: true`.
- `isMultipleTimesForwarded` is only applied when `forward` is true; otherwise the server forces `isMultipleTimesForwarded: false`.

**Responses:** `SEND_MESSAGE_SUCCESS` and `NEW_MESSAGE` include the created message with `isForwarded` and `isMultipleTimesForwarded`.

---

## 3. Private / group chat – send message

**Event:** `sendPrivateMessage`

**Payload (relevant fields):**

```ts
{
  chatroomId: string;
  content?: string;
  media?: string;
  // ... other existing fields (parentMessageId, messageType, location, poll, sharedContent, etc.) ...

  /** Set to true when the user is forwarding a message. */
  forward?: boolean;

  /** Set to true when forwarding a message that was already forwarded. */
  isMultipleTimesForwarded?: boolean;
}
```

Same rules as hashtag:

- Omit `forward` or `forward: false` → normal message.
- `forward: true` → `isForwarded: true` in DB.
- `forward: true` and `isMultipleTimesForwarded: true` → both flags true in DB.

**Responses:** `SEND_PRIVATE_MESSAGE_SUCCESS` and `NEW_PRIVATE_MESSAGE` include `isForwarded` and `isMultipleTimesForwarded` on the message object.

---

## 4. Where the frontend gets these fields

| Source | Fields |
|--------|--------|
| `sendMessage` → `SEND_MESSAGE_SUCCESS` / `NEW_MESSAGE` | `newMessage.isForwarded`, `newMessage.isMultipleTimesForwarded` |
| `sendPrivateMessage` → `SEND_PRIVATE_MESSAGE_SUCCESS` / `NEW_PRIVATE_MESSAGE` | `newMessage.isForwarded`, `newMessage.isMultipleTimesForwarded` |
| Hashtag message history | `messageHistory` (e.g. after `joinRoom`) → each message has `isForwarded`, `isMultipleTimesForwarded` |
| Private message history | `privateMessageHistory` (e.g. after `joinPrivateRoom`) → each message has `isForwarded`, `isMultipleTimesForwarded` |
| Message info | `getMessageInfo` → `messageInfoSuccess` → `message.isForwarded`, `message.isMultipleTimesForwarded` |

---

## 5. UI suggestions

- **Not forwarded:** do not show any “Forwarded” label.
- **Forwarded once:** when `isForwarded === true` and `isMultipleTimesForwarded === false`, show a “Forwarded” label (e.g. above or below the message bubble).
- **Forwarded many times:** when `isMultipleTimesForwarded === true`, show “Forwarded many times” (or similar) to match common chat UX.

When the user taps “Forward” on a message:

1. If that message has `isForwarded === false` → send with `forward: true`, `isMultipleTimesForwarded` omit or `false`.
2. If that message has `isForwarded === true` (or `isMultipleTimesForwarded === true`) → send with `forward: true`, `isMultipleTimesForwarded: true`.

---

## 6. Summary

| Action | Payload | Stored |
|--------|--------|--------|
| Send normal message | omit `forward` or `forward: false` | `isForwarded: false`, `isMultipleTimesForwarded: false` |
| Send forwarded message (first time) | `forward: true` | `isForwarded: true`, `isMultipleTimesForwarded: false` |
| Send forwarded message (already forwarded) | `forward: true`, `isMultipleTimesForwarded: true` | `isForwarded: true`, `isMultipleTimesForwarded: true` |

All message payloads (new message, history, message info) include `isForwarded` and `isMultipleTimesForwarded` so the client can render the correct label without extra APIs.
