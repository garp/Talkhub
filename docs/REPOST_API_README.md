# Repost API Documentation

This document describes the Repost API endpoints for frontend integration. The repost feature allows users to share existing posts with optional commentary, similar to Instagram's repost functionality.

## Table of Contents

- [Data Model](#data-model)
- [API Endpoints](#api-endpoints)
  - [1. Create Repost](#1-create-repost)
  - [2. Remove Repost](#2-remove-repost)
  - [3. Get Single Repost](#3-get-single-repost)
  - [4. Get User's Reposts](#4-get-users-reposts)
  - [5. Update Repost](#5-update-repost)
- [News Feed Integration](#news-feed-integration)
- [Socket Events](#socket-events)
- [Error Codes](#error-codes)

---

## Data Model

### Repost Object

| Field        | Type              | Description                            |
| ------------ | ----------------- | -------------------------------------- |
| `_id`        | ObjectId          | Unique repost identifier               |
| `repostedBy` | ObjectId          | User ID who created the repost         |
| `postId`     | ObjectId          | Original post ID being reposted        |
| `text`       | String (optional) | Commentary text (max 500 characters)   |
| `createdAt`  | Date              | Timestamp when repost was created      |
| `updatedAt`  | Date              | Timestamp when repost was last updated |

---

## API Endpoints

All endpoints require authentication via Bearer token in the Authorization header.

### 1. Create Repost

Creates a new repost of an existing post.

**Endpoint:** `POST /repost/add-repost`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "postId": "string (required)",
  "text": "string (optional, max 500 chars)"
}
```

**Success Response (201):**
```json
{
  "message": "Post reposted successfully",
  "repost": {
    "_id": "65abc123def456...",
    "repostedBy": "64xyz789abc123...",
    "postId": "65post123abc...",
    "text": "Check out this amazing post!",
    "createdAt": "2026-01-29T10:30:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code                | Message                             |
| ------ | ------------------- | ----------------------------------- |
| 400    | ERR-INVALID-POST-ID | Invalid post ID format              |
| 404    | ERR-POST-NOT-FOUND  | Post not found                      |
| 409    | ERR-REPOST-EXISTS   | You have already reposted this post |

---

### 2. Remove Repost

Removes an existing repost. Only the owner can remove their repost.

**Endpoint:** `DELETE /repost/remove-repost`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "repostId": "string (required)"
}
```

**Success Response (200):**
```json
{
  "message": "Repost removed successfully",
  "repostId": "65abc123def456..."
}
```

**Error Responses:**

| Status | Code                  | Message                                                     |
| ------ | --------------------- | ----------------------------------------------------------- |
| 400    | ERR-INVALID-REPOST-ID | Invalid repost ID format                                    |
| 404    | ERR-REPOST-NOT-FOUND  | Repost not found or you do not have permission to delete it |

---

### 3. Get Single Repost

Retrieves a single repost by its ID with full post and user details.

**Endpoint:** `GET /repost/:repostId`

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| repostId  | string | The repost ID to retrieve |

**Success Response (200):**
```json
{
  "repost": {
    "_id": "65abc123def456...",
    "text": "Amazing post!",
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T10:30:00.000Z",
    "repostedBy": {
      "_id": "64xyz789abc123...",
      "fullName": "John Doe",
      "userName": "johndoe",
      "profilePicture": "https://..."
    },
    "originalPost": {
      "_id": "65post123abc...",
      "userId": "64author123...",
      "text": "Original post content",
      "media": [
        {
          "url": "https://...",
          "mediaType": "image"
        }
      ],
      "location": "New York, NY",
      "createdAt": "2026-01-28T15:00:00.000Z",
      "viewCount": 150,
      "userDetails": {
        "_id": "64author123...",
        "fullName": "Jane Smith",
        "userName": "janesmith",
        "profilePicture": "https://..."
      },
      "isLiked": true,
      "isSaved": false,
      "likeCount": 42
    }
  }
}
```

**Error Responses:**

| Status | Code                  | Message                  |
| ------ | --------------------- | ------------------------ |
| 400    | ERR-INVALID-REPOST-ID | Invalid repost ID format |
| 404    | ERR-REPOST-NOT-FOUND  | Repost not found         |

---

### 4. Get User's Reposts

Retrieves all reposts by a specific user with pagination.

**Endpoint:** `GET /repost`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type   | Required | Default | Description                       |
| --------- | ------ | -------- | ------- | --------------------------------- |
| userId    | string | Yes      | -       | User ID whose reposts to retrieve |
| pageNo    | number | No       | 1       | Page number (starts at 1)         |
| pageLimit | number | No       | 20      | Items per page (max 100)          |

**Example Request:**
```
GET /repost?userId=64xyz789abc123&pageNo=1&pageLimit=10
```

**Success Response (200):**
```json
{
  "reposts": [
    {
      "_id": "65abc123def456...",
      "text": "Check this out!",
      "createdAt": "2026-01-29T10:30:00.000Z",
      "updatedAt": "2026-01-29T10:30:00.000Z",
      "repostedBy": {
        "_id": "64xyz789abc123...",
        "fullName": "John Doe",
        "userName": "johndoe",
        "profilePicture": "https://..."
      },
      "originalPost": {
        "_id": "65post123abc...",
        "userId": "64author123...",
        "text": "Original post content",
        "media": [...],
        "location": "New York, NY",
        "createdAt": "2026-01-28T15:00:00.000Z",
        "viewCount": 150,
        "userDetails": {...},
        "isLiked": true,
        "isSaved": false,
        "likeCount": 42
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 47,
    "pageLimit": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Error Responses:**

| Status | Code                | Message                |
| ------ | ------------------- | ---------------------- |
| 400    | ERR-INVALID-USER-ID | Invalid user ID format |

---

### 5. Update Repost

Updates the text of an existing repost. Only the owner can update their repost.

**Endpoint:** `PUT /repost/:repostId`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**URL Parameters:**
| Parameter | Type   | Description             |
| --------- | ------ | ----------------------- |
| repostId  | string | The repost ID to update |

**Request Body:**
```json
{
  "text": "string (optional, max 500 chars)"
}
```

**Success Response (200):**
```json
{
  "message": "Repost updated successfully",
  "repost": {
    "_id": "65abc123def456...",
    "repostedBy": "64xyz789abc123...",
    "postId": "65post123abc...",
    "text": "Updated commentary!",
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T11:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Code                  | Message                                                     |
| ------ | --------------------- | ----------------------------------------------------------- |
| 400    | ERR-INVALID-REPOST-ID | Invalid repost ID format                                    |
| 404    | ERR-REPOST-NOT-FOUND  | Repost not found or you do not have permission to update it |

---

## News Feed Integration

Reposts appear in the `/feed/get-new-feed` endpoint alongside posts and hashtags. They can be identified by the `type` field.

### Feed Item Types

| Type      | Description      |
| --------- | ---------------- |
| `post`    | Regular post     |
| `hashtag` | Hashtag/chatroom |
| `repost`  | Reposted content |

### Repost in Feed Response Structure

When a repost appears in the feed, it has the following structure:

```json
{
  "type": "repost",
  "_id": "65abc123def456...",
  "text": "Check out this post!",
  "createdAt": "2026-01-29T10:30:00.000Z",
  "updatedAt": "2026-01-29T10:30:00.000Z",
  "repostedBy": {
    "_id": "64xyz789abc123...",
    "fullName": "John Doe",
    "userName": "johndoe",
    "profilePicture": "https://...",
    "location": "San Francisco, CA",
    "email": "john@example.com",
    "description": "Tech enthusiast",
    "bannerPicture": "https://..."
  },
  "originalPost": {
    "_id": "65post123abc...",
    "userId": "64author123...",
    "text": "Original post content here",
    "media": [
      {
        "url": "https://...",
        "mediaType": "image",
        "assetId": "65asset..."
      }
    ],
    "location": "New York, NY",
    "labels": ["tech", "innovation"],
    "interestCategories": [...],
    "interestSubCategories": [...],
    "replySettings": "everyone",
    "viewCount": 150,
    "createdAt": "2026-01-28T15:00:00.000Z",
    "updatedAt": "2026-01-28T15:00:00.000Z",
    "userDetails": {
      "_id": "64author123...",
      "fullName": "Jane Smith",
      "userName": "janesmith",
      "profilePicture": "https://...",
      "location": "New York, NY"
    },
    "interestCategoryDetails": [...],
    "interestSubCategoryDetails": [...],
    "likes": [...],
    "isLiked": true,
    "saveDetails": [...],
    "isSaved": false,
    "comments": [...]
  }
}
```

### Frontend Display Recommendations

When rendering a repost in the feed:

1. Show the `repostedBy` user with a "reposted" indicator
2. Display the optional `text` commentary if present
3. Render the `originalPost` as an embedded/quoted post
4. Use `originalPost.userDetails` for the original author info
5. Like/save/comment actions should target the `originalPost._id`

---

## Socket Events

When a user creates a repost, real-time events are emitted to notify other users.

### Event: `newFeed`

Emitted to all connected users (except the creator) when a new repost is created.

**Payload:**
```json
{
  "type": "repost",
  "data": {
    "_id": "65abc123def456...",
    "repostedBy": "64xyz789abc123...",
    "postId": "65post123abc...",
    "text": "Check this out!",
    "createdAt": "2026-01-29T10:30:00.000Z"
  },
  "originalPost": {
    "_id": "65post123abc...",
    "text": "Original content...",
    "media": [...],
    ...
  },
  "creator": {
    "_id": "64xyz789abc123...",
    "userName": "johndoe",
    "fullName": "John Doe",
    "profilePicture": "https://..."
  },
  "createdAt": "2026-01-29T10:30:00.000Z"
}
```

### Event: `newFeedRepost`

Same payload as `newFeed`, but specific to reposts. Listen to this event if you want to handle reposts separately.

### Socket Event Handling Example (JavaScript)

```javascript
socket.on('newFeed', (payload) => {
  if (payload.type === 'repost') {
    // Handle new repost
    console.log(`${payload.creator.fullName} reposted a post`);
    // Add to feed...
  }
});

// Or use the specific event
socket.on('newFeedRepost', (payload) => {
  // Handle new repost
  addToFeed(payload);
});
```

---

## Error Codes

| Code                  | HTTP Status | Description                                           |
| --------------------- | ----------- | ----------------------------------------------------- |
| ERR-INVALID-POST-ID   | 400         | The provided post ID is not a valid ObjectId format   |
| ERR-INVALID-REPOST-ID | 400         | The provided repost ID is not a valid ObjectId format |
| ERR-INVALID-USER-ID   | 400         | The provided user ID is not a valid ObjectId format   |
| ERR-POST-NOT-FOUND    | 404         | The post to be reposted does not exist                |
| ERR-REPOST-NOT-FOUND  | 404         | The repost does not exist or user lacks permission    |
| ERR-REPOST-EXISTS     | 409         | User has already reposted this post                   |
| ERR-400               | 400         | General error (check logs for details)                |

---

## Usage Examples

### Create a Repost (JavaScript/Fetch)

```javascript
const createRepost = async (postId, text = null) => {
  const response = await fetch('/repost/add-repost', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      postId,
      text,
    }),
  });
  
  const data = await response.json();
  return data;
};

// Usage
const result = await createRepost('65post123abc', 'This is amazing!');
```

### Get User Reposts with Pagination

```javascript
const getUserReposts = async (userId, pageNo = 1, pageLimit = 20) => {
  const params = new URLSearchParams({
    userId,
    pageNo: String(pageNo),
    pageLimit: String(pageLimit),
  });
  
  const response = await fetch(`/repost?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const data = await response.json();
  return data;
};

// Usage
const { reposts, pagination } = await getUserReposts('64xyz789abc123', 1, 10);
```

### Handle Reposts in Feed

```javascript
const renderFeedItem = (item) => {
  switch (item.type) {
    case 'post':
      return <PostCard post={item} />;
    case 'hashtag':
      return <HashtagCard hashtag={item} />;
    case 'repost':
      return (
        <RepostCard 
          repostedBy={item.repostedBy}
          repostText={item.text}
          originalPost={item.originalPost}
          repostDate={item.createdAt}
        />
      );
    default:
      return null;
  }
};
```

---

## Notes

- A user can only repost a post once (unique constraint on `repostedBy` + `postId`)
- Reposts from blocked users are automatically excluded from the feed
- The `text` field is optional and can be null or empty string
- Maximum text length is 500 characters
- Deleting the original post does not automatically delete reposts (they will show with missing `originalPost` data)
