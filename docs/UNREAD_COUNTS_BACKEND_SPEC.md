# Unread Message Counts — Backend Socket Specification

## Problem

The frontend currently reconstructs unread message counts locally by combining multiple signals (`unreadMessagesCount`, `readBy`, `status`, `senderDetails`, `messageType`, etc.). This leads to:

- Inaccurate counts (system messages like "User left the group" counted as unread)
- Complex, fragile logic that's hard to maintain
- Mismatch between what the server knows and what the frontend displays

## Solution

Create a dedicated socket event that provides **accurate, server-computed unread counts** for both DM/private chats and public/hashtag chats.

---

## Socket Events Required

### 1. `getUnreadCounts` (Client → Server)

The frontend will emit this event to request unread counts.

**When frontend emits this:**
- On app launch / socket connect
- When Inbox screen receives focus
- On pull-to-refresh

**Payload:** None (uses the authenticated user from the socket session)

```javascript
socket.emit("getUnreadCounts");
```

### 2. `unreadCountsSuccess` (Server → Client)

Server responds with computed unread counts.

**Payload:**

```json
{
  "privateChatUnreadCount": 2,
  "publicChatUnreadCount": 0,
  "privateChats": [
    {
      "chatroomId": "507f1f77bcf86cd799439011",
      "unreadCount": 3
    },
    {
      "chatroomId": "507f1f77bcf86cd799439012",
      "unreadCount": 1
    }
  ],
  "publicChats": [
    {
      "chatroomId": "607f1f77bcf86cd799439099",
      "unreadCount": 5
    }
  ]
}
```

**Field Descriptions:**

| Field | Type | Description |
|---|---|---|
| `privateChatUnreadCount` | `number` | Total number of **private/group chats** that have at least 1 unread message. Used for the "DM's (N)" badge. |
| `publicChatUnreadCount` | `number` | Total number of **public/hashtag chats** that have at least 1 unread message. Used for the "Chats (N)" badge if needed. |
| `privateChats` | `array` | Per-chatroom unread counts for private chats. Only include chats with `unreadCount > 0`. |
| `publicChats` | `array` | Per-chatroom unread counts for public chats. Only include chats with `unreadCount > 0`. |
| `privateChats[].chatroomId` | `string` | The chatroom `_id`. |
| `privateChats[].unreadCount` | `number` | Number of unread messages in this chatroom for the requesting user. |

### 3. `unreadCountsUpdate` (Server → Client) — Real-time Push

Server pushes updated counts whenever they change (new message received, user reads messages, etc.).

**Same payload format as `unreadCountsSuccess`.**

**When server should emit this to a specific user:**
- When a new message is sent to any chatroom the user is a member of
- When the user marks messages as read in a chatroom (count decreases)
- When the user is added to or removed from a chatroom

---

## Counting Rules (Important)

### What counts as unread:
- Messages where the user is **NOT** the sender
- Messages where the user has **NOT** read them (not in `readBy` array)
- Regular messages (`messageType`: `text`, `image`, `video`, `file`, `audio`, `poll`, `location`, etc.)

### What does NOT count as unread:
- Messages sent **by the user** themselves
- Messages the user has already **read**
- **System messages** (`messageType: 'system'`) — e.g., "User left the group", "User was removed", "User joined"
- Messages in chatrooms where the user has been **removed** or has **left** (exParticipants)
- Messages sent **after** the user's `clearedAt` timestamp (if they cleared the chat)

### `clearedAt` handling:
If the user has cleared chat history, only count messages created **after** their `clearedAt` timestamp.

---

## Frontend Integration Plan

Once this socket is ready, the frontend will:

1. **Emit `getUnreadCounts`** on socket connect and on Inbox screen focus
2. **Listen for `unreadCountsSuccess`** and `unreadCountsUpdate`
3. **Use `privateChatUnreadCount`** directly for the "DM's (N)" badge — no local computation
4. **Use `publicChatUnreadCount`** directly for the "Chats (N)" badge — no local computation
5. **Use `privateChats` array** to show per-chat unread dots/counts in the DM list
6. **Use `publicChats` array** to show per-chat unread dots/counts in the public chat list
7. **Remove** the current fragile local unread computation logic

---

## Example Flow

```
1. User opens app → socket connects
2. Frontend: socket.emit("getUnreadCounts")
3. Server:   socket.emit("unreadCountsSuccess", { privateChatUnreadCount: 2, publicChatUnreadCount: 0, privateChats: [...], publicChats: [...] })
4. Frontend: Shows "DM's ②" badge

5. New message arrives in a private chatroom
6. Server:   socket.emit("unreadCountsUpdate", { privateChatUnreadCount: 3, ... })
7. Frontend: Updates badge to "DM's ③"

8. User opens that chat and reads messages
9. Frontend: (existing read receipt logic marks messages as read)
10. Server:  socket.emit("unreadCountsUpdate", { privateChatUnreadCount: 2, ... })
11. Frontend: Updates badge to "DM's ②"
```

---

## Notes

- The `privateChats` and `publicChats` arrays should only contain entries with `unreadCount > 0` (no need to send zero-count entries).
- The `privateChatUnreadCount` is the **number of chats with unread messages**, NOT the total number of unread messages across all chats.
- Same for `publicChatUnreadCount`.
- If a chatroom has no unread messages, simply omit it from the array.
