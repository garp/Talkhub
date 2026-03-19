# User Chits API — `type=media` (Posts Media Tab)

This document describes the extended behavior of the existing endpoint:

`GET /user/chits`

It now supports returning **media posts** for a user using the query param `type=media`.

---

## Endpoint

`GET /user/chits`

## Query Params

- **userId** (required): User ID whose content you want
- **type** (optional): `chits` (default) | `media`
  - `chits`: existing behavior (chatrooms + latest messages)
  - `media`: **NEW** behavior (user posts that contain media)
- **subtype** (optional, only for `type=media`): `all` (default) | `image` | `video`
  - `all`: posts containing any media
  - `image`: posts containing image media
  - `video`: posts containing video media
- **page** (optional): page number (default `1`)
- **limit** (optional): page size (default `20`, max `100`)
- **createdOnly** (optional, only for `type=chits`): boolean (default `false`)

---

## Behavior for `type=media`

When `type=media`, the API returns a paginated list of **posts** for the given `userId`:

- Only **posts with `media` present** are returned (`media` array not empty)
- Replies are excluded by default (`parentPostId: null`)
- Sorted by `createdAt` descending (latest first)
- Filtered by `subtype`:
  - `image` uses `media.mediaType = "image"`
  - `video` uses `media.mediaType = "video"`

---

## Request Examples

### 1) Get all media posts

```bash
curl -X GET \
  -H "Authorization: Bearer <token>" \
  "https://backend-dev.talkhub.co/user/chits?userId=<USER_ID>&type=media&subtype=all&page=1&limit=20"
```

### 2) Get only video posts

```bash
curl -X GET \
  -H "Authorization: Bearer <token>" \
  "https://backend-dev.talkhub.co/user/chits?userId=<USER_ID>&type=media&subtype=video&page=1&limit=20"
```

### 3) Get only image posts

```bash
curl -X GET \
  -H "Authorization: Bearer <token>" \
  "https://backend-dev.talkhub.co/user/chits?userId=<USER_ID>&type=media&subtype=image&page=1&limit=20"
```

---

## Response Shape (type=media)

```json
{
  "data": {
    "metadata": {
      "type": "media",
      "subtype": "video",
      "totalDocuments": 123,
      "totalPages": 7,
      "page": 1,
      "limit": 20
    },
    "posts": [
      {
        "_id": "POST_ID",
        "userId": "USER_ID",
        "user": {
          "_id": "USER_ID",
          "fullName": "Full Name",
          "userName": "@username",
          "profilePicture": "https://..."
        },
        "text": "caption text",
        "location": "optional",
        "media": [
          {
            "url": "https://...",
            "thumbnailUrl": "https://...",
            "mediaType": "video"
          }
        ],
        "mediaModeration": {
          "status": "approved",
          "isBanned": false,
          "checkedAt": "2026-02-08T00:00:00.000Z"
        },
        "labels": [],
        "mentions": [],
        "parentPostId": null,
        "createdAt": "2026-02-08T00:00:00.000Z",
        "updatedAt": "2026-02-08T00:00:00.000Z"
      }
    ]
  }
}
```

Notes:
- `posts[].media[].mediaType` is `image` or `video`.
- Some posts may have multiple media items (mixed types); filtering is based on at least one matching `mediaType`.

