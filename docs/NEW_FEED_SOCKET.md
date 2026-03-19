# New Feed Socket Events

Real-time socket events for broadcasting new content (posts and public hashtags) to connected users.

---

## Overview

When a user creates a new post or public hashtag, the server broadcasts a `newFeed` event to all connected socket clients (except the creator). This enables real-time feed updates without polling.

---

## Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `newFeed` | Server → Client | Generic event for any new feed item |
| `newFeedPost` | Server → Client | Specific event for new posts |
| `newFeedHashtag` | Server → Client | Specific event for new public hashtags |

---

## Event Payload

All three events share the same payload structure:

```json
{
  "type": "post | hashtag",
  "data": {
    "_id": "ObjectId",
    "...": "full post or hashtag object"
  },
  "creator": {
    "_id": "ObjectId",
    "userName": "string",
    "fullName": "string",
    "profilePicture": "string | null"
  },
  "createdAt": "ISO 8601 timestamp"
}
```

### Example: New Post

```json
{
  "type": "post",
  "data": {
    "_id": "676d1234567890abcdef1234",
    "userId": "676d0000000000000000user",
    "text": "Hello world! This is my first post.",
    "media": [],
    "labels": [],
    "likeCount": 0,
    "viewCount": 0,
    "commentCount": 0,
    "repostCount": 0,
    "createdAt": "2025-12-26T17:30:00.000Z"
  },
  "creator": {
    "_id": "676d0000000000000000user",
    "userName": "johndoe",
    "fullName": "John Doe",
    "profilePicture": "https://s3.amazonaws.com/bucket/profile.jpg"
  },
  "createdAt": "2025-12-26T17:30:00.000Z"
}
```

### Example: New Public Hashtag

```json
{
  "type": "hashtag",
  "data": {
    "_id": "676d5678901234abcdef5678",
    "creatorId": "676d0000000000000000user",
    "name": "TechNews",
    "description": "Latest technology news and updates",
    "access": "public",
    "scope": "global",
    "profilePicture": "https://s3.amazonaws.com/bucket/hashtag.jpg",
    "fullLocation": "San Francisco, CA",
    "createdAt": "2025-12-26T17:35:00.000Z"
  },
  "creator": {
    "_id": "676d0000000000000000user",
    "userName": "techguru",
    "fullName": "Tech Guru",
    "profilePicture": "https://s3.amazonaws.com/bucket/profile.jpg"
  },
  "createdAt": "2025-12-26T17:35:00.000Z"
}
```

---

## Client Implementation

### JavaScript / React Native

```javascript
// Listen for all new feed items
socket.on('newFeed', (payload) => {
  console.log('New feed item:', payload.type);
  
  if (payload.type === 'post') {
    // Add new post to feed
    addPostToFeed(payload.data, payload.creator);
  } else if (payload.type === 'hashtag') {
    // Show new hashtag notification
    showNewHashtagNotification(payload.data, payload.creator);
  }
});

// Or listen for specific types
socket.on('newFeedPost', (payload) => {
  // Handle new post only
  prependPostToFeed(payload.data);
  showToast(`${payload.creator.fullName} just posted something!`);
});

socket.on('newFeedHashtag', (payload) => {
  // Handle new hashtag only
  showNewHashtagBanner(payload.data);
});
```

### React Hook Example

```javascript
import { useEffect } from 'react';
import { useSocket } from './useSocket';

export function useNewFeedListener(onNewPost, onNewHashtag) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleNewFeed = (payload) => {
      if (payload.type === 'post' && onNewPost) {
        onNewPost(payload.data, payload.creator);
      } else if (payload.type === 'hashtag' && onNewHashtag) {
        onNewHashtag(payload.data, payload.creator);
      }
    };

    socket.on('newFeed', handleNewFeed);

    return () => {
      socket.off('newFeed', handleNewFeed);
    };
  }, [socket, onNewPost, onNewHashtag]);
}

// Usage in component
function FeedScreen() {
  const [posts, setPosts] = useState([]);

  useNewFeedListener(
    (newPost, creator) => {
      setPosts(prev => [{ ...newPost, user: creator }, ...prev]);
    },
    (newHashtag, creator) => {
      // Handle new hashtag
    }
  );

  return <FeedList posts={posts} />;
}
```

---

## Behavior Notes

### Who Receives Events

- **All connected socket clients** receive the event
- **Except** the user who created the content (creator is excluded)
- Events are broadcast immediately after content creation

### When Events Are Emitted

| Action | Event Emitted | Condition |
|--------|---------------|-----------|
| Create Post | `newFeed` + `newFeedPost` | Always |
| Create Hashtag | `newFeed` + `newFeedHashtag` | Only if `access === 'public'` |

### Private/Broadcast Hashtags

Private and broadcast hashtags do **NOT** trigger `newFeedHashtag` events. Only public hashtags are broadcast to the feed.

---

## Server-Side Architecture

### Files Involved

```
src/
├── events/
│   └── feedEvents.js        # Core emit functions
├── controllers/
│   ├── post.controller.js   # Emits on post creation
│   └── hashtag.controller.js # Emits on public hashtag creation
lib/
└── constants/
    └── socket.js            # Event name constants
```

### Emit Function Signature

```javascript
const { emitNewFeedPost, emitNewFeedHashtag } = require('../events/feedEvents');

// For posts
emitNewFeedPost({
  creatorUserId: 'userId',
  post: { /* post document */ },
  creator: { _id, userName, fullName, profilePicture }
});

// For hashtags (only public)
emitNewFeedHashtag({
  creatorUserId: 'userId',
  hashtag: { /* hashtag document with access: 'public' */ },
  creator: { _id, userName, fullName, profilePicture }
});
```

---

## Error Handling

Socket emit failures are **non-blocking**. If the socket emit fails:
- The content (post/hashtag) is still created successfully
- Error is logged to console
- No error is returned to the client

```javascript
try {
  emitNewFeedPost({ ... });
} catch (e) {
  console.error('Failed to emit newFeedPost:', e.message);
  // Content creation still succeeds
}
```

---

## Testing

### Manual Testing

1. Connect two users via socket (User A and User B)
2. User A creates a post via `POST /post`
3. User B should receive `newFeed` and `newFeedPost` events
4. User A should NOT receive the event (excluded as creator)

### Test with Postman + Socket Client

1. Start the server: `npm run dev`
2. Connect a socket client to `ws://localhost:PORT`
3. Authenticate with JWT token
4. Create content via REST API
5. Observe socket events in connected client

---

## Related Documentation

- [Socket Events Reference](../lib/constants/socket.js)
- [Post API](../src/routes/post.routes.js)
- [Hashtag API](../src/routes/hashtag.routes.js)

