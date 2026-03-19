# Impression Socket Integration Guide

This document describes how to integrate the impression tracking feature for **posts** and **hashtags** using WebSocket events.

---

## Overview

The impression feature allows tracking view counts for posts and hashtags in real-time. When a user views a post or hashtag, the frontend emits an event to increment the view count, and the server responds with the updated count.

---

## Connection Setup

Before using impression events, ensure you have an active socket connection:

```javascript
import { io } from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  query: {
    userId: 'user-id-here',
  },
  auth: {
    token: 'your-auth-token',
  },
});

// Connection success
socket.on('pairSuccess', (data) => {
  console.log('Connected:', data.message);
});

// Connection failed
socket.on('pairFailed', (error) => {
  console.error('Connection failed:', error.message);
});
```

---

## Impression Events

### Event Flow Diagram

#### For Posts:
```
┌──────────────┐                              ┌──────────────┐
│   Frontend   │                              │    Server    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  emit('addImpression', { postId })          │
       │────────────────────────────────────────────>│
       │                                             │
       │                              [Increment viewCount in DB]
       │                                             │
       │  on('addImpressionSuccess', { postId, viewCount })
       │<────────────────────────────────────────────│
       │                                             │
       │  on('impressionAdded', { postId, viewCount })
       │<────────────────────────────────────────────│
       │                                             │
```

#### For Hashtags:
```
┌──────────────┐                              ┌──────────────┐
│   Frontend   │                              │    Server    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  emit('addImpression', { hashtagId })       │
       │────────────────────────────────────────────>│
       │                                             │
       │                              [Increment viewCount in DB]
       │                                             │
       │  on('addImpressionSuccess', { hashtagId, viewCount })
       │<────────────────────────────────────────────│
       │                                             │
       │  on('impressionAdded', { hashtagId, viewCount })
       │<────────────────────────────────────────────│
       │                                             │
```

---

## Events Reference

### 1. `addImpression` (Client → Server)

Emit this event when a user views a post or hashtag to increment its view count.

**Payload:**

| Field       | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| `postId`    | String | No*      | The MongoDB ObjectId of the post   |
| `hashtagId` | String | No*      | The MongoDB ObjectId of the hashtag |

> *Either `postId` OR `hashtagId` is required. If both are provided, `hashtagId` takes priority.

**Example (Post):**

```javascript
socket.emit('addImpression', {
  postId: '507f1f77bcf86cd799439011'
});
```

**Example (Hashtag):**

```javascript
socket.emit('addImpression', {
  hashtagId: '507f1f77bcf86cd799439012'
});
```

---

### 2. `addImpressionSuccess` (Server → Client)

Received when the impression was successfully recorded.

**Response Payload (Post):**

| Field       | Type   | Description                        |
|-------------|--------|------------------------------------|
| `postId`    | String | The post ID that was updated       |
| `viewCount` | Number | The new total view count for the post |

**Response Payload (Hashtag):**

| Field       | Type   | Description                           |
|-------------|--------|---------------------------------------|
| `hashtagId` | String | The hashtag ID that was updated       |
| `viewCount` | Number | The new total view count for the hashtag |

**Example:**

```javascript
socket.on('addImpressionSuccess', (data) => {
  if (data.postId) {
    console.log(`Post ${data.postId} now has ${data.viewCount} views`);
  } else if (data.hashtagId) {
    console.log(`Hashtag ${data.hashtagId} now has ${data.viewCount} views`);
  }
});
```

---

### 3. `impressionAdded` (Server → Client)

Emitted after a successful impression update. Can be used to update UI components.

**Response Payload (Post):**

| Field       | Type   | Description                        |
|-------------|--------|------------------------------------|
| `postId`    | String | The post ID that was updated       |
| `viewCount` | Number | The new total view count for the post |

**Response Payload (Hashtag):**

| Field       | Type   | Description                           |
|-------------|--------|---------------------------------------|
| `hashtagId` | String | The hashtag ID that was updated       |
| `viewCount` | Number | The new total view count for the hashtag |

**Example:**

```javascript
socket.on('impressionAdded', (data) => {
  if (data.postId) {
    // Update the view count for post in your UI
    updatePostViewCount(data.postId, data.viewCount);
  } else if (data.hashtagId) {
    // Update the view count for hashtag in your UI
    updateHashtagViewCount(data.hashtagId, data.viewCount);
  }
});
```

---

### 4. `addImpressionFailed` (Server → Client)

Received when the impression could not be recorded.

**Response Payload:**

| Field     | Type   | Description          |
|-----------|--------|----------------------|
| `message` | String | Error description    |

**Possible Error Messages:**

- `"postId or hashtagId is required"` - Neither postId nor hashtagId was provided
- `"Post not found"` - No post exists with the given ID
- `"Hashtag not found"` - No hashtag exists with the given ID
- `"Failed to add impression"` - Server error occurred

**Example:**

```javascript
socket.on('addImpressionFailed', (error) => {
  console.error('Failed to add impression:', error.message);
});
```

---

## Complete Integration Example

### React Example

```jsx
import { useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

// Initialize socket (do this once in your app)
const socket = io('YOUR_SERVER_URL', {
  query: { userId: 'current-user-id' },
  auth: { token: 'auth-token' },
});

function PostCard({ post }) {
  const [viewCount, setViewCount] = useState(post.viewCount || 0);

  useEffect(() => {
    // Listen for impression updates
    const handleImpressionAdded = (data) => {
      if (data.postId === post._id) {
        setViewCount(data.viewCount);
      }
    };

    const handleImpressionFailed = (error) => {
      console.error('Impression failed:', error.message);
    };

    socket.on('impressionAdded', handleImpressionAdded);
    socket.on('addImpressionFailed', handleImpressionFailed);

    return () => {
      socket.off('impressionAdded', handleImpressionAdded);
      socket.off('addImpressionFailed', handleImpressionFailed);
    };
  }, [post._id]);

  // Track impression when post comes into view
  const trackImpression = useCallback(() => {
    socket.emit('addImpression', { postId: post._id });
  }, [post._id]);

  // Call trackImpression when the post is viewed
  // (e.g., using Intersection Observer)

  return (
    <div className="post-card">
      <h2>{post.title}</h2>
      <p>{post.text}</p>
      <span className="view-count">{viewCount} views</span>
    </div>
  );
}
```

### React Native Example

```jsx
import { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { io } from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  query: { userId: 'current-user-id' },
  auth: { token: 'auth-token' },
});

function PostItem({ post, isVisible }) {
  const [viewCount, setViewCount] = useState(post.viewCount || 0);
  const [hasTracked, setHasTracked] = useState(false);

  useEffect(() => {
    const handleImpressionAdded = (data) => {
      if (data.postId === post._id) {
        setViewCount(data.viewCount);
      }
    };

    socket.on('impressionAdded', handleImpressionAdded);
    socket.on('addImpressionFailed', (err) => console.warn(err.message));

    return () => {
      socket.off('impressionAdded', handleImpressionAdded);
      socket.off('addImpressionFailed');
    };
  }, [post._id]);

  // Track impression when post becomes visible
  useEffect(() => {
    if (isVisible && !hasTracked) {
      socket.emit('addImpression', { postId: post._id });
      setHasTracked(true);
    }
  }, [isVisible, hasTracked, post._id]);

  return (
    <View style={styles.postCard}>
      <Text style={styles.title}>{post.title}</Text>
      <Text style={styles.viewCount}>{viewCount} views</Text>
    </View>
  );
}
```

---

## Best Practices

### 1. Debounce Impressions

To avoid counting multiple impressions for the same view, implement debouncing:

```javascript
const trackedPosts = new Set();

function trackImpression(postId) {
  if (trackedPosts.has(postId)) return;
  
  trackedPosts.add(postId);
  socket.emit('addImpression', { postId });
  
  // Optionally clear after some time to allow re-counting
  setTimeout(() => trackedPosts.delete(postId), 60000); // 1 minute
}
```

### 2. Use Intersection Observer (Web)

Track impressions only when posts are actually visible:

```javascript
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const postId = entry.target.dataset.postId;
        trackImpression(postId);
      }
    });
  },
  { threshold: 0.5 } // 50% visible
);

// Observe post elements
document.querySelectorAll('.post-card').forEach((el) => {
  observer.observe(el);
});
```

### 3. Handle Reconnection

Ensure socket reconnection doesn't lose state:

```javascript
socket.on('connect', () => {
  console.log('Socket connected');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

socket.on('reconnect', () => {
  console.log('Socket reconnected');
});
```

---

## Error Handling

Always implement error handlers to gracefully handle failures:

```javascript
socket.on('addImpressionFailed', (error) => {
  switch (error.message) {
    case 'postId is required':
      console.error('Developer error: postId not provided');
      break;
    case 'Post not found':
      console.warn('Post may have been deleted');
      break;
    default:
      console.error('Server error:', error.message);
  }
});
```

---

## Data Models

### Post Model

The `Post` model includes the following field for view tracking:

```javascript
{
  // ... other fields
  viewCount: {
    type: Number,
    default: 0
  }
}
```

### Hashtag Model

The `Hashtag` model includes the following field for view tracking:

```javascript
{
  // ... other fields
  viewCount: {
    type: Number,
    default: 0
  }
}
```

---

## REST API Endpoints with viewCount

The `viewCount` field is automatically included in responses from the following REST API endpoints:

### Post Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/post/get-all-posts` | GET | Returns all posts with `viewCount` |
| `/post/get-saved-posts` | GET | Returns saved posts with `viewCount` |
| `/post/views-count/:postId` | GET | Returns only the `viewCount` for a specific post |

**Example Post Response:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "text": "Hello world!",
  "viewCount": 42,
  "likeCount": 10,
  "isLiked": false,
  "isSaved": false,
  ...
}
```

### Hashtag Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hashtag/get-one/:hashtagId` | GET | Returns hashtag details with `viewCount` |
| `/hashtag/get-saved-hashtags` | GET | Returns saved hashtags with `viewCount` |

**Example Hashtag Response:**

```json
{
  "_id": "507f1f77bcf86cd799439012",
  "name": "TechNews",
  "viewCount": 156,
  "likeCount": 25,
  "type": "hashtag",
  ...
}
```

### Feed Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/feed/get-feed` | GET | Returns hashtags with `viewCount` |
| `/feed/get-new-feed` | GET | Returns mixed feed (posts & hashtags) with `viewCount` |
| `/feed/get-around-me-feed` | GET | Returns location-based hashtags with `viewCount` |
| `/feed/get-people-feed` | GET | Returns posts with `viewCount` |

**Example Mixed Feed Response (`/feed/get-new-feed`):**

```json
{
  "data": {
    "metadata": { ... },
    "feed": [
      {
        "_id": "...",
        "name": "TechNews",
        "viewCount": 156,
        "type": "hashtag",
        ...
      },
      {
        "_id": "...",
        "text": "Hello world!",
        "viewCount": 42,
        "type": "post",
        ...
      }
    ]
  }
}
```

### Other Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/repost/get-all-reposts/:postId` | GET | Returns reposts with `originalPost.viewCount` |
| `/reply/get-all-replies/:postId` | GET | Returns replies (posts) with `viewCount` |
| `/profile/get-posts` | GET | Returns user's posts with `viewCount` |
| `/profile/get-reposts` | GET | Returns user's reposts with `viewCount` |

---

## Summary

| Event                  | Direction        | Description                                      |
|------------------------|------------------|--------------------------------------------------|
| `addImpression`        | Client → Server  | Request to increment view count (post or hashtag)|
| `addImpressionSuccess` | Server → Client  | Confirmation of successful update                |
| `impressionAdded`      | Server → Client  | Notification with updated view count             |
| `addImpressionFailed`  | Server → Client  | Error notification                               |

### Payload Variants

| Type    | Request Payload        | Response Payload                  |
|---------|------------------------|-----------------------------------|
| Post    | `{ postId: "..." }`    | `{ postId: "...", viewCount: N }` |
| Hashtag | `{ hashtagId: "..." }` | `{ hashtagId: "...", viewCount: N }` |

---

## Support

For questions or issues, contact the backend team.

