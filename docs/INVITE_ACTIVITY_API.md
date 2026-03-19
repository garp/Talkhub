# Hashtag Invite Activity API

This API provides a timeline view of all invite activities for a hashtag, displayed as human-readable sentences.

---

## Endpoint

```
GET /hashtags/:hashtagId/invite-activity
```

### Authentication

Requires Bearer token in Authorization header.

```
Authorization: Bearer <your_jwt_token>
```

---

## Request

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hashtagId` | string | Yes | The ID of the hashtag |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination (min: 1) |
| `limit` | number | 20 | Number of activities per page (min: 1, max: 100) |
| `status` | string | "all" | Filter by status: `pending`, `accepted`, `rejected`, `cancelled`, or `all` |

### Example Request

```bash
curl -X GET "https://api.example.com/hashtags/64abc123def456/invite-activity?page=1&limit=20&status=all" \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "_id": "64def789abc123",
        "sentence": "Saurav sent invite to Kavin as Collaborator",
        "action": "invited",
        "status": "pending",
        "roleKey": "COLLABORATOR",
        "hashtag": {
          "_id": "64abc123def456",
          "name": "TeamProject",
          "slug": "teamproject",
          "profilePicture": "https://cdn.example.com/hashtag.jpg"
        },
        "inviter": {
          "_id": "64user111",
          "name": "Saurav",
          "userName": "saurav",
          "fullName": "Saurav Kumar",
          "profilePicture": "https://cdn.example.com/saurav.jpg"
        },
        "target": {
          "_id": "64user222",
          "name": "Kavin",
          "userName": "kavin",
          "fullName": "Kavin Shah",
          "profilePicture": "https://cdn.example.com/kavin.jpg"
        },
        "createdAt": "2026-01-15T10:30:00.000Z",
        "respondedAt": null,
        "updatedAt": "2026-01-15T10:30:00.000Z"
      },
      {
        "_id": "64def789abc124",
        "sentence": "Kavin accepted the invite as Member from Saurav",
        "action": "accepted",
        "status": "accepted",
        "roleKey": "MEMBER",
        "hashtag": {
          "_id": "64abc123def456",
          "name": "TeamProject",
          "slug": "teamproject",
          "profilePicture": "https://cdn.example.com/hashtag.jpg"
        },
        "inviter": {
          "_id": "64user111",
          "name": "Saurav",
          "userName": "saurav",
          "fullName": "Saurav Kumar",
          "profilePicture": "https://cdn.example.com/saurav.jpg"
        },
        "target": {
          "_id": "64user222",
          "name": "Kavin",
          "userName": "kavin",
          "fullName": "Kavin Shah",
          "profilePicture": "https://cdn.example.com/kavin.jpg"
        },
        "createdAt": "2026-01-15T09:00:00.000Z",
        "respondedAt": "2026-01-15T10:00:00.000Z",
        "updatedAt": "2026-01-15T10:00:00.000Z"
      },
      {
        "_id": "64def789abc125",
        "sentence": "Mumin rejected the invite from Saurav",
        "action": "rejected",
        "status": "rejected",
        "roleKey": "ADMIN",
        "hashtag": {
          "_id": "64abc123def456",
          "name": "TeamProject",
          "slug": "teamproject",
          "profilePicture": "https://cdn.example.com/hashtag.jpg"
        },
        "inviter": {
          "_id": "64user111",
          "name": "Saurav",
          "userName": "saurav",
          "fullName": "Saurav Kumar",
          "profilePicture": "https://cdn.example.com/saurav.jpg"
        },
        "target": {
          "_id": "64user333",
          "name": "Mumin",
          "userName": "mumin",
          "fullName": "Mumin Khan",
          "profilePicture": "https://cdn.example.com/mumin.jpg"
        },
        "createdAt": "2026-01-15T08:00:00.000Z",
        "respondedAt": "2026-01-15T08:30:00.000Z",
        "updatedAt": "2026-01-15T08:30:00.000Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 3
  }
}
```

---

## Response Fields

### Activity Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Unique identifier for the invite request |
| `sentence` | string | Human-readable sentence describing the activity |
| `action` | string | Action type: `invited`, `accepted`, `rejected`, `cancelled`, `unknown` |
| `status` | string | Current status: `pending`, `accepted`, `rejected`, `cancelled` |
| `roleKey` | string | Role offered in the invite (e.g., `MEMBER`, `ADMIN`, `MODERATOR`) |
| `hashtag` | object | Hashtag information |
| `inviter` | object | User who sent the invite |
| `target` | object | User who received the invite |
| `createdAt` | string | ISO timestamp when invite was created |
| `respondedAt` | string \| null | ISO timestamp when invite was accepted/rejected (null if pending) |
| `updatedAt` | string | ISO timestamp of last update |

### User Object (inviter/target)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string \| null | User ID |
| `name` | string | Display name (fullName or userName) |
| `userName` | string \| null | Username |
| `fullName` | string \| null | Full name |
| `profilePicture` | string \| null | Profile picture URL |

### Hashtag Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Hashtag ID |
| `name` | string \| null | Hashtag name |
| `slug` | string \| null | Hashtag slug |
| `profilePicture` | string \| null | Hashtag profile picture URL |

---

## Sentence Patterns

The `sentence` field follows these patterns based on status:

| Status | Sentence Pattern |
|--------|-----------------|
| `pending` | `{inviter} sent invite to {target} as {role}` |
| `accepted` | `{target} accepted the invite as {role} from {inviter}` |
| `rejected` | `{target} rejected the invite from {inviter}` |
| `cancelled` | `{inviter} cancelled the invite to {target}` |

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Hashtag not found"
}
```

---

## Frontend Integration Example

### React/TypeScript

```typescript
interface User {
  _id: string | null;
  name: string;
  userName: string | null;
  fullName: string | null;
  profilePicture: string | null;
}

interface Hashtag {
  _id: string;
  name: string | null;
  slug: string | null;
  profilePicture: string | null;
}

interface InviteActivity {
  _id: string;
  sentence: string;
  action: 'invited' | 'accepted' | 'rejected' | 'cancelled' | 'unknown';
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  roleKey: string;
  hashtag: Hashtag;
  inviter: User;
  target: User;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
}

interface InviteActivityResponse {
  success: boolean;
  data: {
    activities: InviteActivity[];
    page: number;
    limit: number;
    total: number;
  };
}

// Fetch invite activity
async function fetchInviteActivity(
  hashtagId: string,
  page: number = 1,
  limit: number = 20,
  status: string = 'all'
): Promise<InviteActivityResponse> {
  const response = await fetch(
    `/hashtags/${hashtagId}/invite-activity?page=${page}&limit=${limit}&status=${status}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.json();
}
```

### React Component Example

```tsx
import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

function InviteActivityList({ hashtagId }: { hashtagId: string }) {
  const [activities, setActivities] = useState<InviteActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInviteActivity(hashtagId)
      .then((res) => setActivities(res.data.activities))
      .finally(() => setLoading(false));
  }, [hashtagId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="invite-activity-list">
      <h3>Invite Activity</h3>
      {activities.map((activity) => (
        <div key={activity._id} className={`activity-item status-${activity.status}`}>
          <img 
            src={activity.inviter.profilePicture || '/default-avatar.png'} 
            alt={activity.inviter.name}
            className="avatar"
          />
          <div className="activity-content">
            <p className="sentence">{activity.sentence}</p>
            <span className="timestamp">
              {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
            </span>
          </div>
          <span className={`status-badge ${activity.status}`}>
            {activity.status}
          </span>
        </div>
      ))}
    </div>
  );
}
```

### CSS Styling Example

```css
.invite-activity-list {
  padding: 16px;
}

.activity-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
  gap: 12px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.activity-content {
  flex: 1;
}

.sentence {
  margin: 0;
  font-size: 14px;
  color: #333;
}

.timestamp {
  font-size: 12px;
  color: #888;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background: #fff3cd;
  color: #856404;
}

.status-badge.accepted {
  background: #d4edda;
  color: #155724;
}

.status-badge.rejected {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.cancelled {
  background: #e2e3e5;
  color: #383d41;
}
```

---

## Filtering Examples

### Get only pending invites

```
GET /hashtags/:hashtagId/invite-activity?status=pending
```

### Get accepted invites with pagination

```
GET /hashtags/:hashtagId/invite-activity?status=accepted&page=2&limit=10
```

### Get all activities (default)

```
GET /hashtags/:hashtagId/invite-activity
```

---

## Notes

- Activities are sorted by `updatedAt` in descending order (most recent first)
- The `respondedAt` field is only populated when the invite is accepted or rejected
- For pending invites, `respondedAt` will be `null`
- The `name` field in user objects will fall back to `userName` if `fullName` is not available
