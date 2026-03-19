# Story Like & Story Viewers API

> **Version:** 1.1  
> **Date:** 2026-02-10  
> **Base URL:** `/api/stories`  
> **Auth:** All endpoints require `Authorization: Bearer <token>` header.

---

## Table of Contents

1. [Like / Unlike a Story](#1-like--unlike-a-story)
2. [Get Story Viewers (with isLiked)](#2-get-story-viewers-with-isliked)
3. [isLiked on All Story GET Endpoints](#3-isliked-on-all-story-get-endpoints)
4. [Stories Feed — viewList on Own Stories](#4-stories-feed--viewlist-on-own-stories)

---

## 1. Like / Unlike a Story

Toggle a "like" (heart) on someone else's story. Calling the endpoint again will **unlike** the story. This is separate from the existing emoji reaction feature.

### Endpoint

```
POST /api/stories/:storyId/like
```

### Headers

| Header          | Type   | Required | Description            |
|-----------------|--------|----------|------------------------|
| Authorization   | string | Yes      | `Bearer <access_token>` |

### Path Parameters

| Parameter | Type     | Required | Description                     |
|-----------|----------|----------|---------------------------------|
| storyId   | ObjectId | Yes      | The ID of the story to like     |

### Request Body

_None required._

### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "liked": true,
    "story": {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "userId": "664f1a2b3c4d5e6f7a8b9c01",
      "storyUrl": "https://cdn.example.com/stories/abc.jpg",
      "thumbnailUrl": "https://cdn.example.com/stories/abc_thumb.jpg",
      "type": "image",
      "viewCount": 12,
      "replyCount": 0,
      "reactionCount": 3,
      "likeCount": 5,
      "createdAt": "2026-02-10T08:30:00.000Z",
      "updatedAt": "2026-02-10T09:15:00.000Z"
    }
  }
}
```

### Response Fields

| Field               | Type    | Description                                                   |
|---------------------|---------|---------------------------------------------------------------|
| `liked`             | boolean | `true` if the story is now liked, `false` if unliked (toggled)|
| `story`             | object  | The updated story object with latest counters                 |
| `story.likeCount`   | number  | Total number of likes on the story                            |

### Error Responses

| Status | Condition                           | Response Body                                              |
|--------|-------------------------------------|------------------------------------------------------------|
| 404    | Story not found                     | `{ "success": false, "message": "Story not found" }`      |
| 403    | User blocked or not allowed to view | `{ "success": false, "message": "You are not allowed to like this story" }` |
| 401    | Missing / invalid token             | `{ "success": false, "message": "Unauthorized" }`         |

### Behavior Notes

- **Toggle:** First call = like, second call = unlike, and so on.
- If the user has not viewed the story yet, liking it will also **record a view** automatically.
- `likeCount` on the story is a denormalized counter that increments/decrements with each toggle.
- This is **independent** from the emoji reaction (`POST /:storyId/reaction`). A user can both like AND react to the same story.

---

## 2. Get Story Viewers (with isLiked)

Retrieve the list of users who have viewed your story, along with whether each viewer has **liked** your story.

> **Note:** Only the **story owner** can call this endpoint.

### Endpoint

```
GET /api/stories/:storyId/viewers
```

### Headers

| Header          | Type   | Required | Description            |
|-----------------|--------|----------|------------------------|
| Authorization   | string | Yes      | `Bearer <access_token>` |

### Path Parameters

| Parameter | Type     | Required | Description                      |
|-----------|----------|----------|----------------------------------|
| storyId   | ObjectId | Yes      | The ID of the story to get viewers for |

### Query Parameters

| Parameter | Type   | Required | Default | Description                        |
|-----------|--------|----------|---------|------------------------------------|
| page      | number | No       | 1       | Page number for pagination         |
| limit     | number | No       | 20      | Items per page (max 50)            |

### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "viewers": [
      {
        "_id": "664f1a2b3c4d5e6f7a8b9c0e",
        "viewerId": "664f1a2b3c4d5e6f7a8b9c02",
        "viewedAt": "2026-02-10T09:00:00.000Z",
        "reaction": "❤️",
        "isLiked": true,
        "viewer": {
          "_id": "664f1a2b3c4d5e6f7a8b9c02",
          "fullName": "Jane Doe",
          "userName": "janedoe",
          "profilePicture": "https://cdn.example.com/avatars/jane.jpg"
        }
      },
      {
        "_id": "664f1a2b3c4d5e6f7a8b9c0f",
        "viewerId": "664f1a2b3c4d5e6f7a8b9c03",
        "viewedAt": "2026-02-10T08:45:00.000Z",
        "reaction": null,
        "isLiked": false,
        "viewer": {
          "_id": "664f1a2b3c4d5e6f7a8b9c03",
          "fullName": "John Smith",
          "userName": "johnsmith",
          "profilePicture": "https://cdn.example.com/avatars/john.jpg"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalCount": 12,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

### Response Fields

| Field                       | Type    | Description                                          |
|-----------------------------|---------|------------------------------------------------------|
| `viewers[]`                 | array   | List of viewer objects                               |
| `viewers[].viewerId`        | string  | The user ID of the viewer                            |
| `viewers[].viewedAt`        | string  | ISO timestamp of when the story was viewed           |
| `viewers[].reaction`        | string  | Emoji reaction (or `null` if no reaction)            |
| `viewers[].isLiked`         | boolean | `true` if the viewer liked (hearted) your story      |
| `viewers[].viewer`          | object  | Viewer's profile information                         |
| `viewers[].viewer.fullName` | string  | Full name of the viewer                              |
| `viewers[].viewer.userName` | string  | Username of the viewer                               |
| `viewers[].viewer.profilePicture` | string | Profile picture URL of the viewer              |
| `pagination`                | object  | Pagination metadata                                  |
| `pagination.page`           | number  | Current page number                                  |
| `pagination.limit`          | number  | Items per page                                       |
| `pagination.totalCount`     | number  | Total number of viewers                              |
| `pagination.totalPages`     | number  | Total number of pages                                |
| `pagination.hasNextPage`    | boolean | Whether there is a next page                         |
| `pagination.hasPrevPage`    | boolean | Whether there is a previous page                     |

### Error Responses

| Status | Condition                                | Response Body                                                                           |
|--------|------------------------------------------|-----------------------------------------------------------------------------------------|
| 404    | Story not found                          | `{ "success": false, "message": "Story not found" }`                                   |
| 403    | Caller is not the story owner            | `{ "success": false, "message": "You do not have permission to view viewers for this story" }` |
| 401    | Missing / invalid token                  | `{ "success": false, "message": "Unauthorized" }`                                      |

---

## 3. `isLiked` on All Story GET Endpoints

Every endpoint that returns story objects now includes an `isLiked` boolean for the **authenticated user**, so the frontend can render the like state immediately and allow the user to unlike if already liked.

### Affected Endpoints

| Endpoint | Where `isLiked` appears |
|----------|-------------------------|
| `GET /api/stories/feed` | On each story inside each reel: `reels[].stories[].isLiked` |
| `GET /api/stories/` | On each story in the array: `stories[].isLiked` |
| `GET /api/stories/` (grouped) | On each story inside each group: `collections[].stories[].isLiked` |
| `GET /api/stories/:storyId` | On the story object: `data.isLiked` |

### Example — Feed story object (inside a reel)

```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "storyUrl": "https://cdn.example.com/stories/abc.jpg",
  "thumbnailUrl": "https://cdn.example.com/stories/abc_thumb.jpg",
  "type": "image",
  "caption": "Sunset vibes",
  "viewCount": 12,
  "reactionCount": 3,
  "likeCount": 5,
  "isLiked": true,
  "createdAt": "2026-02-10T08:30:00.000Z"
}
```

### Example — Single story by ID

```json
{
  "success": true,
  "data": {
    "_id": "664f1a2b3c4d5e6f7a8b9c0d",
    "storyUrl": "https://cdn.example.com/stories/abc.jpg",
    "mediaType": "image",
    "viewCount": 12,
    "reactionCount": 3,
    "likeCount": 5,
    "isLiked": false,
    "isHighlight": false,
    "user": { ... }
  }
}
```

### Frontend Usage

- Use `isLiked` to render a filled/unfilled heart icon on each story.
- When the user taps the heart, call `POST /api/stories/:storyId/like` (toggle).
- Use the `liked` boolean in the toggle response to update local state, or optimistically flip `isLiked` before the response arrives.

---

## 4. Stories Feed — `viewList` on Own Stories

When `isOwnStory: true`, each story now includes a `viewList` array — the list of users who viewed the story, with their profile info and whether they liked it.

> For other users' stories (`isOwnStory: false`), `viewList` is **not included** (privacy). Only `isLiked` (for the current viewer) is present.

### Where it appears

```
GET /api/stories/feed  →  reels[].stories[].viewList   (only when isOwnStory: true)
```

### Example — Own story in the feed

```json
{
  "_id": "698b18bb224c0f0ae8dd9e05",
  "storyUrl": "https://cdn.example.com/stories/abc.jpg",
  "type": "image",
  "viewCount": 3,
  "likeCount": 2,
  "isLiked": false,
  "viewList": [
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c02",
      "fullName": "Jane Doe",
      "userName": "@janedoe",
      "profilePicture": "https://cdn.example.com/avatars/jane.jpg",
      "isLiked": true,
      "viewedAt": "2026-02-10T09:10:00.000Z"
    },
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c03",
      "fullName": "John Smith",
      "userName": "@johnsmith",
      "profilePicture": "https://cdn.example.com/avatars/john.jpg",
      "isLiked": false,
      "viewedAt": "2026-02-10T08:50:00.000Z"
    }
  ]
}
```

### `viewList[]` fields

| Field            | Type    | Description                              |
|------------------|---------|------------------------------------------|
| `_id`            | string  | Viewer's user ID                         |
| `fullName`       | string  | Viewer's full name                       |
| `userName`       | string  | Viewer's username                        |
| `profilePicture` | string  | Viewer's profile picture URL             |
| `isLiked`        | boolean | Whether this viewer liked the story      |
| `viewedAt`       | string  | ISO timestamp of when they viewed        |

### User Object Cleanup

The `user` object in each reel no longer includes sensitive/internal fields. Previously leaked fields have been removed:

**Removed from response:**
- ~~`blockedUsers`~~
- ~~`closeFriends`~~
- ~~`storyHiddenFrom`~~
- ~~`isPrivateAccount`~~

**Clean user object now returns:**

```json
{
  "_id": "697e39dfb6514ed0686ed2e9",
  "fullName": "Himanshu Joshi",
  "userName": "@himanshujoshi07",
  "profilePicture": "https://cdn.example.com/avatars/himanshu.jpg"
}
```

---

## Integration Checklist

- [ ] **Like Story:** Wire up `POST /api/stories/:storyId/like` to the heart/like button on story viewer screen
- [ ] **Toggle UI state:** Use the `liked` boolean in the toggle response to update the heart icon (filled/unfilled)
- [ ] **Like count display:** Use `likeCount` from the story object to display the total like count
- [ ] **Pre-populated state from GET APIs:** Use `isLiked` returned on every story object (feed, list, single) to set the initial heart state — no extra API call needed
- [ ] **viewList on own stories:** For `isOwnStory: true` reels, render the `viewList` array to show who viewed + who liked each story
- [ ] **Viewers list endpoint:** `GET /api/stories/:storyId/viewers` returns `isLiked` per viewer — use for the full paginated viewer screen
- [ ] **Optimistic update:** Consider toggling the UI optimistically before the API response returns
- [ ] **Distinguish like vs reaction:** `isLiked` (boolean heart) is separate from `reaction` (emoji). Both can coexist on the same viewer record

---

## Data Model Changes (for reference)

### `storyView` — new field

| Field   | Type    | Default | Description                    |
|---------|---------|---------|--------------------------------|
| `liked` | Boolean | `false` | Whether the viewer liked the story |

### `stories` — new counter

| Field       | Type   | Default | Description                  |
|-------------|--------|---------|------------------------------|
| `likeCount` | Number | `0`     | Denormalized count of likes  |
