# Stories (Instagram-like) — Frontend Integration Guide

This doc explains how to integrate the **Stories** feature implemented in this server into the existing frontend app (REST + Socket.IO).

## Base URLs

- **REST base**: `https://<YOUR_API_HOST>`
- **Socket base**: `https://<YOUR_SOCKET_HOST>` (usually same as API host)

Auth:
- REST uses `Authorization: Bearer <JWT>`
- Socket uses query params: `token=<JWT>&userId=<USER_ID>`

## REST APIs

### 1) Create story (upload)

**POST** `/stories`

**Auth**: required

**Content-Type**: `multipart/form-data`

Form fields:
- `storyFile` (file, required) — image/video
- `audience` (string, optional): `"followers"` | `"close_friends"`
- `caption` (string, optional)
- `mentionUserIds` (stringified JSON array, optional): `["<USER_ID>", ...]`
- `linkSticker` (stringified JSON object, optional): `{"url":"https://...","label":"..."}` (url must be valid URI)
- `interactive` (stringified JSON object, optional): `{"polls":[],"questions":[],"sliders":[]}`
- `hashtagId` (string, optional) — creates a hashtag story if present
- `isHighlight` (boolean, optional)

Example (fetch):

```js
async function createStory({ apiBase, token, file, audience, caption }) {
  const form = new FormData();
  form.append('storyFile', file);
  if (audience) form.append('audience', audience);
  if (caption != null) form.append('caption', caption);

  const res = await fetch(`${apiBase}/stories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Failed to create story');
  return json; // { data: { story: ... } }
}
```

Realtime behavior:
- Server will push `newStoryReel` to eligible followers (see Socket section).

### 2) Stories feed (Instagram-like reels)

**GET** `/stories/feed`

**Auth**: required

Query:
- `page` (number, optional, default 1)
- `limit` (number, optional, default 10)

Response:
- `data.reels` is an array of **reels grouped by owner**.
- Each reel includes:
  - `userId`, `user` (profile fields), `stories[]`, `latestStoryAt`, `storyCount`
  - `isOwnStory`
  - `hasUnseen` + `lastSeenAt` (for sorting/ring state)

### 3) Record story view (idempotent)

**POST** `/stories/:storyId/view`

**Auth**: required

Response:
- `data.inserted`: `true` only the first time this viewer views the story
- `data.story.viewCount` updated

### 4) List story viewers (owner-only)

**GET** `/stories/:storyId/viewers?page=1&limit=20`

**Auth**: required

Response:
- `data.viewers[]`: `{ viewerId, viewedAt, reaction, viewer: { _id, fullName, userName, profilePicture } }`
- `data.pagination`

### 5) React to story (emoji)

**POST** `/stories/:storyId/reaction`

**Auth**: required

Body JSON:

```json
{ "emoji": "😍" }
```

Notes:
- If the viewer has not viewed the story before, reaction will also create a view record (counts as a view).

### 6) Fetch story settings (privacy)

**GET** `/user/story-settings`

**Auth**: required

Response:
- `data.settings.isPrivateAccount`
- `data.settings.closeFriends[]`
- `data.settings.storyHiddenFrom[]`

### 7) Update story settings (privacy)

**PATCH** `/user/story-settings`

**Auth**: required

Body JSON (any subset):

```json
{
  "isPrivateAccount": false,
  "closeFriends": ["USER_ID_1", "USER_ID_2"],
  "storyHiddenFrom": ["USER_ID_9"]
}
```

## Socket.IO (real-time)

### Connection (required pattern in this backend)

This server authenticates sockets via `token` in query and expects `userId` in query as well.

Example (`socket.io-client`):

```js
import { io } from 'socket.io-client';

export function connectSocket({ socketBase, token, userId }) {
  const socket = io(socketBase, {
    transports: ['websocket'],
    query: { token, userId },
  });

  socket.on('pairSuccess', (payload) => {
    // payload: { message, onlineStatus }
  });

  socket.on('pairFailed', (err) => {
    // auth failure or other connect issue
  });

  return socket;
}
```

### Events (Stories)

These are defined in `lib/constants/socket.js`.

#### Subscribe (optional helper)

Client → Server:
- `storyFeedSubscribe`

Server → Client:
- `storyFeedSubscribeSuccess` `{ room }`
- `storyFeedSubscribeFailed` `{ message }`

Example:

```js
socket.emit('storyFeedSubscribe', {});
```

#### Record view (socket variant)

Client → Server:
- `storyView` `{ storyId }`

Server → Client (actor):
- `storyViewSuccess` `{ storyId, inserted, viewCount }`
- `storyViewFailed` `{ message, reason? }`

Server → Client (owner room):
- `storyViewersUpdated` `{ storyId, viewCount }`

Example:

```js
socket.emit('storyView', { storyId });
```

#### React (socket variant)

Client → Server:
- `storyReaction` `{ storyId, emoji }`

Server → Client (actor):
- `storyReactionSuccess` `{ storyId, reactionCount, viewCount }`
- `storyReactionFailed` `{ message, reason? }`

Server → Client (owner room):
- `storyReactionsUpdated` `{ storyId, reactionCount }`

Example:

```js
socket.emit('storyReaction', { storyId, emoji: '🔥' });
```

#### Delete (socket variant)

Client → Server:
- `storyDelete` `{ storyId }`

Server → Client (actor):
- `storyDeleteSuccess` `{ storyId, isActive: false }`
- `storyDeleteFailed` `{ message }`

Server → Client (owner room):
- `storyReelUpdated` `{ ownerId, storyId }`

#### Server push: new story ring update

Server → Client:
- `newStoryReel` `{ ownerId, storyId, latestStoryAt }`
- `storyReelUpdated` `{ ownerId, storyId, latestStoryAt? }`

Recommended UI behavior on `newStoryReel`:
- Update the ring for `ownerId` to “unseen”
- Optionally re-fetch `GET /stories/feed` to refresh ordering and story list

## Privacy/audience rules (how to mirror Instagram behavior in UI)

The server enforces these rules for viewing stories:
- **Blocked**: if viewer is blocked by owner (or vice versa), viewer cannot see stories.
- **Hide-from**: if viewerId is in owner’s `storyHiddenFrom`, viewer cannot see stories.
- **Private account**: if owner `isPrivateAccount=true`, viewer must be an accepted follower.
- **Audience**:
  - `followers`: accepted followers + self
  - `close_friends`: viewer must be in owner’s `closeFriends` + self

## Expiry behavior

- Stories expire in the backend via cron (every ~10 minutes).
- After expiry, stories are marked `isActive=false` and `isArchived=true` (kept for archive/highlights).

Frontend guidance:
- Treat stories in `/stories/feed` as the source of truth for what’s playable in the “Stories” UI.
- Use the returned `expiresAt`/`createdAt` for timers, but expect the backend to enforce actual access.

