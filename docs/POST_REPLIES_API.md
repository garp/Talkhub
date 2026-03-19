# Post Replies API

Get all posts where a specific user has replied to comments. This is useful when viewing a user's profile to see their comment reply activity.

---

## Use Case

When User A views User C's profile, this API shows:
- All posts where User C has replied to someone's comment
- The original comment that was replied to
- User C's reply details

**Example Flow:**
1. User A posts a Post
2. User B comments on the Post
3. User C replies to User B's comment
4. When viewing User C's profile, this API returns the Post with User B's comment and User C's reply attached

---

## Endpoint

```
GET /post/replies/:userId
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
| `userId` | string | Yes | The ID of the user whose post replies to fetch |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pageNum` | number | 1 | Page number for pagination (min: 1) |
| `pageSize` | number | 20 | Number of items per page (min: 1, max: 100) |

### Example Request

```bash
curl -X GET "https://api.example.com/post/replies/64abc123def456?pageNum=1&pageSize=20" \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "metadata": {
      "totalCount": 15,
      "totalPages": 1,
      "currentPage": 1,
      "pageSize": 20
    },
    "targetUser": {
      "_id": "64abc123def456",
      "userName": "userc",
      "fullName": "User C",
      "profilePicture": "https://cdn.example.com/userc.jpg"
    },
    "postReplies": [
      {
        "_id": "64post111",
        "post": {
          "_id": "64post111",
          "userId": "64usera111",
          "userDetails": {
            "_id": "64usera111",
            "fullName": "User A",
            "userName": "usera",
            "profilePicture": "https://cdn.example.com/usera.jpg",
            "email": "usera@example.com",
            "location": "New York",
            "description": "Post creator",
            "bannerPicture": null
          },
          "text": "This is the original post by User A",
          "media": [
            {
              "url": "https://cdn.example.com/image.jpg",
              "mediaType": "image"
            }
          ],
          "location": "New York",
          "labels": ["tech", "coding"],
          "interestCategories": [],
          "interestSubCategories": [],
          "interestCategoryDetails": [],
          "interestSubCategoryDetails": [],
          "replySettings": "everyone",
          "extraReplySetting": null,
          "viewCount": 150,
          "repostCount": 5,
          "likeCount": 25,
          "commentCount": 10,
          "isLiked": false,
          "isSaved": true,
          "createdAt": "2026-01-10T08:00:00.000Z",
          "updatedAt": "2026-01-10T08:00:00.000Z"
        },
        "replyDetails": {
          "comment": {
            "_id": "64comment222",
            "content": "Great post! I have a question about this.",
            "media": [],
            "postId": "64post111",
            "commentBy": {
              "_id": "64userb222",
              "fullName": "User B",
              "userName": "userb",
              "profilePicture": "https://cdn.example.com/userb.jpg"
            },
            "createdAt": "2026-01-10T09:00:00.000Z",
            "updatedAt": "2026-01-10T09:00:00.000Z"
          },
          "reply": {
            "_id": "64reply333",
            "content": "Thanks for the question! Here's my answer...",
            "media": [],
            "replyBy": {
              "_id": "64abc123def456",
              "fullName": "User C",
              "userName": "userc",
              "profilePicture": "https://cdn.example.com/userc.jpg"
            },
            "replyTo": "64userb222",
            "parentCommentId": "64comment222",
            "createdAt": "2026-01-10T10:00:00.000Z",
            "updatedAt": "2026-01-10T10:00:00.000Z"
          }
        }
      }
    ]
  }
}
```

---

## Response Fields

### Metadata Object

| Field | Type | Description |
|-------|------|-------------|
| `totalCount` | number | Total number of post replies by this user |
| `totalPages` | number | Total number of pages |
| `currentPage` | number | Current page number |
| `pageSize` | number | Items per page |

### Target User Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | User ID |
| `userName` | string | Username |
| `fullName` | string | Full name |
| `profilePicture` | string \| null | Profile picture URL |

### Post Reply Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Post ID |
| `post` | object | Full post details (see Post Object below) |
| `replyDetails` | object | Contains the comment and reply (see Reply Details below) |

### Post Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Post ID |
| `userId` | string | Post creator's user ID |
| `userDetails` | object | Post creator's profile info |
| `text` | string \| null | Post text content |
| `media` | array | Array of media objects (url, mediaType) |
| `location` | string \| null | Location tag |
| `labels` | array | Post labels/tags |
| `interestCategories` | array | Interest category IDs |
| `interestSubCategories` | array | Interest subcategory IDs |
| `interestCategoryDetails` | array | Full interest category objects |
| `interestSubCategoryDetails` | array | Full interest subcategory objects |
| `replySettings` | string | "everyone" or "nobody" |
| `viewCount` | number | Number of views |
| `repostCount` | number | Number of reposts |
| `likeCount` | number | Number of likes |
| `commentCount` | number | Number of top-level comments |
| `isLiked` | boolean | Whether current user liked this post |
| `isSaved` | boolean | Whether current user saved this post |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Reply Details Object

| Field | Type | Description |
|-------|------|-------------|
| `comment` | object | The parent comment that was replied to |
| `reply` | object | The user's reply to that comment |

### Comment Object (in replyDetails)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Comment ID |
| `content` | string | Comment text |
| `media` | array | Comment media attachments |
| `postId` | string | Post ID this comment belongs to |
| `commentBy` | object | User who made the comment (\_id, fullName, userName, profilePicture) |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Reply Object (in replyDetails)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Reply ID |
| `content` | string | Reply text |
| `media` | array | Reply media attachments |
| `replyBy` | object | User who made the reply (\_id, fullName, userName, profilePicture) |
| `replyTo` | string | User ID being replied to |
| `parentCommentId` | string | Parent comment ID |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 404 Not Found (User not found)

```json
{
  "success": false,
  "message": "User not found"
}
```

---

## Frontend Integration

### TypeScript Types

```typescript
interface UserDetails {
  _id: string;
  fullName: string;
  userName: string;
  profilePicture: string | null;
  email?: string;
  location?: string;
  description?: string;
  bannerPicture?: string | null;
}

interface Media {
  url: string;
  mediaType: 'image' | 'video';
}

interface CommentBy {
  _id: string;
  fullName: string;
  userName: string;
  profilePicture: string | null;
}

interface Comment {
  _id: string;
  content: string;
  media: Media[];
  postId: string;
  commentBy: CommentBy;
  createdAt: string;
  updatedAt: string;
}

interface Reply {
  _id: string;
  content: string;
  media: Media[];
  replyBy: CommentBy;
  replyTo: string;
  parentCommentId: string;
  createdAt: string;
  updatedAt: string;
}

interface ReplyDetails {
  comment: Comment;
  reply: Reply;
}

interface Post {
  _id: string;
  userId: string;
  userDetails: UserDetails;
  text: string | null;
  media: Media[];
  location: string | null;
  labels: string[];
  viewCount: number;
  repostCount: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PostReply {
  _id: string;
  post: Post;
  replyDetails: ReplyDetails;
}

interface PostRepliesResponse {
  success: boolean;
  data: {
    metadata: {
      totalCount: number;
      totalPages: number;
      currentPage: number;
      pageSize: number;
    };
    targetUser: {
      _id: string;
      userName: string;
      fullName: string;
      profilePicture: string | null;
    };
    postReplies: PostReply[];
  };
}
```

### React/TypeScript Example

```typescript
async function fetchPostReplies(
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PostRepliesResponse> {
  const response = await fetch(
    `/post/replies/${userId}?pageNum=${page}&pageSize=${pageSize}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch post replies');
  }

  return response.json();
}
```

### React Component Example

```tsx
import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  userId: string;
}

function UserPostReplies({ userId }: Props) {
  const [data, setData] = useState<PostRepliesResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetchPostReplies(userId, page)
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [userId, page]);

  if (loading) return <div>Loading...</div>;
  if (!data || data.postReplies.length === 0) {
    return <div>No replies yet</div>;
  }

  return (
    <div className="post-replies">
      <h3>Replies by {data.targetUser.fullName}</h3>
      
      {data.postReplies.map((item) => (
        <div key={item._id} className="post-reply-card">
          {/* Original Post */}
          <div className="original-post">
            <img 
              src={item.post.userDetails.profilePicture || '/default-avatar.png'} 
              alt={item.post.userDetails.userName}
              className="avatar"
            />
            <div className="post-content">
              <strong>{item.post.userDetails.fullName}</strong>
              <p>{item.post.text}</p>
              {item.post.media.map((m, idx) => (
                m.mediaType === 'image' 
                  ? <img key={idx} src={m.url} alt="Post media" />
                  : <video key={idx} src={m.url} controls />
              ))}
            </div>
          </div>

          {/* Reply Thread */}
          <div className="reply-thread">
            {/* Original Comment */}
            <div className="comment">
              <img 
                src={item.replyDetails.comment.commentBy.profilePicture || '/default-avatar.png'}
                alt={item.replyDetails.comment.commentBy.userName}
                className="avatar-small"
              />
              <div>
                <strong>{item.replyDetails.comment.commentBy.fullName}</strong>
                <p>{item.replyDetails.comment.content}</p>
                <span className="timestamp">
                  {formatDistanceToNow(new Date(item.replyDetails.comment.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* User's Reply */}
            <div className="reply">
              <img 
                src={item.replyDetails.reply.replyBy.profilePicture || '/default-avatar.png'}
                alt={item.replyDetails.reply.replyBy.userName}
                className="avatar-small"
              />
              <div>
                <strong>{item.replyDetails.reply.replyBy.fullName}</strong>
                <p>{item.replyDetails.reply.content}</p>
                <span className="timestamp">
                  {formatDistanceToNow(new Date(item.replyDetails.reply.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Pagination */}
      <div className="pagination">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <span>Page {data.metadata.currentPage} of {data.metadata.totalPages}</span>
        <button 
          onClick={() => setPage(p => p + 1)}
          disabled={page >= data.metadata.totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### CSS Styling Example

```css
.post-replies {
  padding: 16px;
}

.post-reply-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
}

.original-post {
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-small {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.post-content {
  flex: 1;
}

.post-content img,
.post-content video {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
}

.reply-thread {
  padding-top: 16px;
  padding-left: 24px;
  border-left: 2px solid #e5e7eb;
  margin-left: 24px;
}

.comment,
.reply {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.reply {
  margin-left: 24px;
}

.timestamp {
  font-size: 12px;
  color: #6b7280;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}

.pagination button {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## Notes

- Results are sorted by reply creation date (most recent first)
- The `post` object contains full post details similar to the main `/post` API
- `isLiked` and `isSaved` are computed based on the current authenticated user
- The `replyDetails.comment` is the comment that was replied to
- The `replyDetails.reply` is the target user's reply to that comment
