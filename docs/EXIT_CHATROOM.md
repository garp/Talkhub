# Exit Chatroom (Hashtag + Private Chatroom)

This document describes the **exit chatroom** flows (WhatsApp-like) for:

- **Hashtag chatrooms** (public/private hashtag chats)
- **Private chatrooms** (1:1 and group chats)

All endpoints are **authenticated** and use `req.user.userId`.

---

## Endpoints

### Hashtag

- **POST** `/hashtag/:hashtagId/exit`

### Private chatroom

- **POST** `/private-chatroom/:chatroomId/exit`

---

## Request body

Both endpoints support the same body:

```json
{
  "deleteForMe": false
}
```

- `deleteForMe=false` (**Exit group**)
  - Private group: sets `participants.$.isPresent=false` but keeps it visible in list (so user can still open and see old messages).
  - Hashtag: removes user from hashtag chat participants; optionally still visible depends on client list logic.
- `deleteForMe=true` (**Exit group and delete it for me**)
  - Private group: sets `participants.$.isPresent=false` and `participants.$.deletedForMe=true` so it is hidden from private chat list for that user.
  - Hashtag: exits and also hides from hashtag chat list (same behavior as “remove from chat list”).

Notes:
- For **1:1 private chats**, `exit` is treated as **delete for me** (leaving a 1:1 chat doesn’t make sense).

---

## Admin leaves group handling

When an **admin exits a private group chat**:

- The user is removed from `admins[]`
- If that admin was the **last admin**, the server **promotes** the first remaining present participant to admin

When an **admin exits a hashtag chatroom**:

- The user is removed from `admins[]`
- If that admin was the **last admin**, the server **promotes** the first remaining participant to admin (best-effort)

---

## Storage (what changes in DB)

### Private chatroom (`privateChatrooms`)

- `participants[].isPresent` (boolean)
- `participants[].exitedAt` (date)
- `participants[].deletedForMe` (boolean)
- `participants[].deletedAt` (date)
- `exParticipants[]` (audit trail)

Private chat list APIs are updated to **exclude** chatrooms where the current user has `deletedForMe=true`.

### Hashtag chatroom (`chatrooms`)

- `exParticipants[]` (audit trail)
- Participant record in `participants` collection is deleted for that user+chatroom on exit.

---

## Example responses (shape)

### Private exit

```json
{
  "message": "Exited chatroom",
  "chatroomId": "64f1c2e9d9c1c2e9d9c1c2e9",
  "isGroupChat": true,
  "isPresent": false,
  "deleteForMe": false,
  "promotedAdminUserId": null,
  "chatroom": {}
}
```

### Hashtag exit

```json
{
  "message": "Exited hashtag chatroom",
  "hashtagId": "64f1c2e9d9c1c2e9d9c1c2e9",
  "chatroomId": "64f1c2e9d9c1c2e9d9c1c2e0",
  "deleteForMe": false,
  "promotedAdminUserId": null
}
```


