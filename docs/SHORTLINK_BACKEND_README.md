# Short Link API - Node.js Backend

A URL shortening service for TalkHub deep links. This API allows the mobile app to create short, shareable URLs that redirect users to specific screens within the app.

## Table of Contents

- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Usage Examples](#usage-examples)
- [Error Codes](#error-codes)

---

## Overview

This service provides:
- **Short link generation** - Convert long deep link data into 6-character codes
- **Short link resolution** - Retrieve original data from short codes (public endpoint)
- **Click tracking** - Track how many times each link is accessed
- **Link expiration** - Optional expiry for temporary links
- **User link management** - View and delete your created links

### Architecture

```
Mobile App ──► POST /shortlink ──► MongoDB (stores link data)
                                        │
Website ◄──── GET /shortlink/:code ◄────┘
    │
    └──► Redirects to app scheme: talkhub://deeplink?data={...}
```

---

## Environment Variables

Add to your `.env` file:

```env
# Short Link Settings
SHORT_LINK_BASE_URL=https://talkhub.co/s
```

---

## API Endpoints

### Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/shortlink` | Yes | Create a new short link |
| GET | `/shortlink` | Yes | Get user's short links |
| GET | `/shortlink/:code` | No | Resolve short link (public) |
| GET | `/shortlink/:code/stats` | Yes | Get link statistics |
| DELETE | `/shortlink/:code` | Yes | Delete a short link |

---

### 1. Create Short Link

Creates a new short link and returns the short URL.

```
POST /shortlink
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| screen | string | Yes | Target screen (see valid screens below) |
| id | string | Yes | Resource ID (hashtagId, postId, userId, etc.) |
| type | string | No | Additional type: `public`, `private`, `broadcast` |
| name | string | No | Display name for preview |
| expiresIn | number | No | Hours until expiration (1-8760, null = never) |
| extra | object | No | Additional custom parameters |

**Valid Screens:**
```
publicchat | privatechat | post | profile | topic | hashtag | referral | story | message
```

**Example Request:**

```bash
curl -X POST https://backend.talkhub.co/shortlink \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "screen": "publicchat",
    "id": "6979e6d29dba2d37ccfafa65",
    "type": "public",
    "name": "doremon123"
  }'
```

**Success Response (201):**

```json
{
  "code": "xK9mPq",
  "shortUrl": "https://talkhub.co/s/xK9mPq",
  "expiresAt": null
}
```

---

### 2. Resolve Short Link (Public)

Retrieves the original data for a short code. Used by the website to get deep link data.

```
GET /shortlink/:code
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | 6-character short code |

**Example Request:**

```bash
curl https://backend.talkhub.co/shortlink/xK9mPq
```

**Success Response (200):**

```json
{
  "screen": "publicchat",
  "id": "6979e6d29dba2d37ccfafa65",
  "type": "public",
  "name": "doremon123"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | ERR-SHORTLINK-404 | Link not found |
| 410 | ERR-SHORTLINK-410 | Link has expired |

---

### 3. Get User's Short Links

Get all short links created by the authenticated user.

```
GET /shortlink
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max: 100) |

**Example Request:**

```bash
curl "https://backend.talkhub.co/shortlink?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**

```json
{
  "shortlinks": [
    {
      "code": "xK9mPq",
      "shortUrl": "https://talkhub.co/s/xK9mPq",
      "screen": "publicchat",
      "id": "6979e6d29dba2d37ccfafa65",
      "name": "doremon123",
      "clickCount": 42,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": null
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 50,
    "limit": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### 4. Get Link Statistics

Get click statistics for a short link (only for links you created).

```
GET /shortlink/:code/stats
Authorization: Bearer <token>
```

**Example Request:**

```bash
curl https://backend.talkhub.co/shortlink/xK9mPq/stats \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**

```json
{
  "code": "xK9mPq",
  "clickCount": 42,
  "screen": "publicchat",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": null
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 403 | ERR-SHORTLINK-403 | Not authorized (not your link) |
| 404 | ERR-SHORTLINK-404 | Link not found |

---

### 5. Delete Short Link

Delete a short link (only for links you created).

```
DELETE /shortlink/:code
Authorization: Bearer <token>
```

**Example Request:**

```bash
curl -X DELETE https://backend.talkhub.co/shortlink/xK9mPq \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**

```json
{
  "message": "Short link deleted successfully",
  "code": "xK9mPq"
}
```

---

## Data Models

### ShortLink Schema

```javascript
{
  code: String,           // Unique 6-char code (indexed)
  data: {
    screen: String,       // publicchat, post, profile, etc.
    id: String,           // Resource ID
    type: String,         // Optional: public, private
    name: String,         // Optional: Display name
    extra: Object         // Optional: Additional params
  },
  createdBy: ObjectId,    // Reference to users collection
  clickCount: Number,     // Default: 0
  expiresAt: Date,        // Optional expiration (TTL index)
  createdAt: Date,
  updatedAt: Date
}
```

### TypeScript Interface

```typescript
interface ShortLink {
  code: string;
  shortUrl: string;
  screen: 'publicchat' | 'privatechat' | 'post' | 'profile' | 'topic' | 'hashtag' | 'referral' | 'story' | 'message';
  id: string;
  type?: string;
  name?: string;
  clickCount: number;
  createdAt: string;
  expiresAt: string | null;
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| ERR-400 | 400 | Bad Request - Missing or invalid parameters |
| ERR-401 | 401 | Unauthorized - Invalid or missing token |
| ERR-SHORTLINK-403 | 403 | Forbidden - Not authorized to access this link |
| ERR-SHORTLINK-404 | 404 | Not Found - Short link doesn't exist |
| ERR-SHORTLINK-410 | 410 | Gone - Short link has expired |

---

## Usage Examples

### Mobile App - Creating a Short Link

```javascript
// React Native / JavaScript
const createShortLink = async (screen, id, name) => {
  const response = await fetch('https://backend.talkhub.co/shortlink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      screen,
      id,
      name,
    }),
  });

  const data = await response.json();
  return data.shortUrl; // "https://talkhub.co/s/xK9mPq"
};

// Example usage
const shareUrl = await createShortLink('publicchat', hashtagId, hashtagName);
Share.share({ url: shareUrl });
```

### Website - Resolving a Short Link

```javascript
// Next.js / JavaScript
const resolveShortLink = async (code) => {
  const response = await fetch(`https://backend.talkhub.co/shortlink/${code}`);
  
  if (!response.ok) {
    if (response.status === 404) throw new Error('Link not found');
    if (response.status === 410) throw new Error('Link expired');
    throw new Error('Failed to resolve link');
  }
  
  return response.json();
  // { screen: "publicchat", id: "xxx", type: "public", name: "..." }
};

// Redirect to app
const data = await resolveShortLink('xK9mPq');
window.location.href = `talkhub://${data.screen}?id=${data.id}`;
```

### Swift - Creating a Short Link

```swift
func createShortLink(screen: String, id: String, name: String?) async throws -> String {
    var body: [String: Any] = [
        "screen": screen,
        "id": id
    ]
    if let name = name {
        body["name"] = name
    }
    
    var request = URLRequest(url: URL(string: "https://backend.talkhub.co/shortlink")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(ShortLinkResponse.self, from: data)
    return response.shortUrl
}
```

---

## File Structure

```
src/
├── models/
│   └── shortlink.model.js      # Mongoose schema
├── services/
│   └── shortlinkServices.js    # Data access layer
├── validators/
│   └── shortlink.validators.js # Joi validation schemas
├── controllers/
│   └── shortlink.controller.js # API handlers
└── routes/
    └── shortlink.routes.js     # Route definitions

lib/configs/
└── env.config.js               # SHORT_LINK_BASE_URL config
```

---

## License

Proprietary - TalkHub
