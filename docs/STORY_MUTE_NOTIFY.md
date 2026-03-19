# Story Mute & Notify Feature

## Overview

Two new per-user story preferences that work independently:

- **Mute** -- User A mutes User B's stories. B's stories will no longer appear in A's feed, and A won't receive the `newStoryReel` socket event when B uploads a story.
- **Notify** -- User A enables notifications for User B's stories. When B uploads a new story, A receives a push notification (FCM).

Both are independent toggles. A user can mute someone (hide from feed) while also having notify enabled, or any combination.

---

## HTTP API Endpoints

All endpoints are **authenticated** (`Authorization: Bearer <token>`).

Base path: `/stories`

### 1. Mute a User's Stories

```
POST /stories/muteUserStories
```

**Request Body:**

```json
{
  "userId": "<target_user_id>"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "isMuted": true,
    "message": "Stories muted successfully"
  }
}
```

**Notes:**
- Calling again when already muted returns `isMuted: true` with message `"Stories already muted"`.
- Cannot mute your own stories (returns `400`).

---

### 2. Unmute a User's Stories

```
POST /stories/unmuteUserStories
```

**Request Body:**

```json
{
  "userId": "<target_user_id>"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "isMuted": false,
    "message": "Stories unmuted successfully"
  }
}
```

---

### 3. Enable Story Notifications for a User

```
POST /stories/notifyUserStories
```

**Request Body:**

```json
{
  "userId": "<target_user_id>"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "isNotifying": true,
    "message": "Story notifications enabled successfully"
  }
}
```

**Notes:**
- Calling again when already enabled returns `isNotifying: true` with message `"Story notifications already enabled"`.
- Cannot enable for your own stories (returns `400`).

---

### 4. Disable Story Notifications for a User

```
POST /stories/unnotifyUserStories
```

**Request Body:**

```json
{
  "userId": "<target_user_id>"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "isNotifying": false,
    "message": "Story notifications disabled successfully"
  }
}
```

---

## User Profile Response Changes

The `GET /profile/info/:userId` response now includes two new boolean fields in the `userInfo` object:

```json
{
  "success": true,
  "data": {
    "userInfo": {
      "fullName": "John Doe",
      "username": "johndoe",
      "isFollowing": true,
      "followsYou": false,
      "isStoryMuted": false,
      "isStoryNotifyEnabled": true,
      "highlightCollections": []
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `isStoryMuted` | `boolean` | `true` if the current viewer has muted this user's stories. Use to show "Mute Stories" vs "Unmute Stories" toggle. |
| `isStoryNotifyEnabled` | `boolean` | `true` if the current viewer has enabled story notifications for this user. Use to show "Notify" vs "Stop Notifying" toggle. |

---

## Feed Response Changes

The `GET /stories/feed` response now includes two new boolean fields on **each reel object**:

```json
{
  "success": true,
  "data": {
    "reels": [
      {
        "userId": "abc123",
        "isOwnStory": false,
        "isStoryMuted": false,
        "isStoryNotifyEnabled": true,
        "stories": [
          {
            "_id": "story1",
            "storyUrl": "...",
            "isLiked": false
          }
        ]
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `isStoryMuted` | `boolean` | `true` if the current viewer has muted this reel owner's stories. Note: muted reels are **excluded** from the feed, so this will typically be `false` in feed results. Useful if you fetch a user profile separately and want to show the toggle state. |
| `isStoryNotifyEnabled` | `boolean` | `true` if the current viewer has enabled push notifications for this reel owner's stories. |

---

## Socket Events

### Existing Event: `newStoryReel`

No new socket events were added. The existing `newStoryReel` event is still emitted when a user uploads a story, but **muted users are now excluded** from receiving it.

**Payload (unchanged):**

```json
{
  "ownerId": "<story_owner_user_id>",
  "storyId": "<new_story_id>",
  "latestStoryAt": "2026-02-10T12:00:00.000Z"
}
```

**Behavior change:** If User A has muted User B's stories, A will **not** receive the `newStoryReel` event when B uploads a story.

---

## Push Notifications

When a user uploads a new story, followers who have enabled story notifications for that user will receive an FCM push notification.

**Notification payload:**

| Field | Value |
|-------|-------|
| `title` | `"{ownerName} posted a new story"` |
| `body` | `"Tap to view their story"` |
| `type` | `"new_story"` |
| `data.ownerId` | The story owner's user ID |
| `data.storyId` | The new story's ID |
| `imageUrl` | Story thumbnail URL (if available) |

**Use `data.ownerId` and `data.storyId`** for deep-linking into the story viewer when the notification is tapped.

---

## Frontend Integration Guide

### UI Placement

These toggles typically appear on a user's profile or in a long-press/context menu on a story reel avatar in the feed.

### Suggested UI States

**Mute Toggle:**
- Label: "Mute Stories" / "Unmute Stories"
- State: Use `isStoryMuted` from the feed reel or fetch the user's profile
- Action: Call `POST /stories/muteUserStories` or `POST /stories/unmuteUserStories`

**Notify Toggle:**
- Label: "Notify when they post" / "Stop notifying"
- State: Use `isStoryNotifyEnabled` from the feed reel
- Action: Call `POST /stories/notifyUserStories` or `POST /stories/unnotifyUserStories`

### Handling the Push Notification (Client-side)

When receiving a push notification with `type: "new_story"`:

1. Parse `data.ownerId` and `data.storyId` from the notification payload
2. On tap, navigate to the story viewer for that owner
3. Optionally show a rich notification using `imageUrl` (story thumbnail)

### Feed Refresh After Mute/Unmute

After calling mute/unmute, refresh the stories feed (`GET /stories/feed`) to reflect the change. Muted users' story reels will be removed from the feed response.

---

## Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Trying to mute/notify yourself | `{ "success": false, "message": "You cannot mute your own stories" }` |
| `400` | Invalid or missing `userId` | Joi validation error |
| `401` | Missing or invalid auth token | Unauthorized |
