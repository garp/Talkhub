# Global Search API Documentation

## Overview

The Global Search API provides a unified search endpoint to search across multiple entities in the application:
- **Chats**: Hashtag-based chat rooms
- **Chits**: Messages within chatrooms the user participates in
- **People**: Users in the system
- **Topics**: Interest categories (e.g., Sports, Music, Technology)
- **Media**: Posts containing images/videos (filterable by subtype)

## Endpoint

```
GET /global-search
```

**Authentication Required**: Yes (JWT Bearer Token)

---

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyword` | string | Yes | - | Search term (1-200 characters) |
| `type` | string | No | `all` | Search type: `all`, `chats`, `chits`, `people`, `topic`, `media` |
| `subtype` | string | No | `all` | When `type=media`: `all`, `image`, `video` |
| `pageNum` | number | No | `1` | Page number for pagination (min: 1) |
| `pageSize` | number | No | `20` | Results per page (min: 1, max: 100) |
| `allSize` | number | No | `5` | When `type=all`, limits results per category (min: 1, max: 20) |

### Type Values

| Type | Description |
|------|-------------|
| `all` | Returns limited results from all categories (including media). Use `allSize` to control how many results per category. |
| `chats` | Search hashtags (chat rooms) |
| `chits` | Search messages within user's joined chatrooms |
| `people` | Search users by name or username |
| `topic` | Search interest categories |
| `media` | Search posts with media (images/videos). Use `subtype` to filter. |

### Subtype Values (for `type=media`)

| Subtype | Description |
|---------|-------------|
| `all` | All posts with any media (default) |
| `image` | Posts containing image media only |
| `video` | Posts containing video media only |

---

## Response Format

### When `type=all`

```json
{
  "success": true,
  "data": {
    "metadata": {
      "keyword": "hello",
      "type": "all",
      "allSize": 5,
      "totals": {
        "chats": 15,
        "chits": 42,
        "people": 8,
        "topic": 15,
        "media": 23
      }
    },
    "results": {
      "chats": [
        {
          "_id": "64abc123...",
          "name": "hello-world",
          "description": "A hello world chat",
          "profilePicture": "https://...",
          "chatroomId": "64abc456...",
          "type": "chats"
        }
      ],
      "chits": [
        {
          "_id": "64def789...",
          "content": "Hello everyone!",
          "media": [],
          "createdAt": "2024-01-15T10:30:00.000Z",
          "chatroomId": "64abc456...",
          "hashtag": {
            "_id": "64abc123...",
            "name": "hello-world",
            "profilePicture": "https://..."
          },
          "senderDetails": {
            "_id": "64user123...",
            "fullName": "John Doe",
            "userName": "@johndoe",
            "profilePicture": "https://..."
          },
          "type": "chits"
        }
      ],
      "people": [
        {
          "_id": "64user456...",
          "fullName": "Hello User",
          "userName": "@hellouser",
          "profilePicture": "https://...",
          "description": "Hi there!",
          "followers": 150,
          "following": 75,
          "type": "people"
        }
      ],
      "topic": [
        {
          "_id": "64cat123...",
          "name": "Music",
          "slug": "music",
          "description": "All things music",
          "icon": "https://...",
          "backgroundImage": "https://...",
          "order": 1,
          "type": "topic"
        }
      ],
      "media": [
        {
          "_id": "64post789...",
          "userId": "64user123...",
          "user": {
            "_id": "64user123...",
            "fullName": "John Doe",
            "userName": "@johndoe",
            "profilePicture": "https://..."
          },
          "text": "Hello world post",
          "media": [
            {
              "url": "https://...",
              "thumbnailUrl": "https://...",
              "mediaType": "image"
            }
          ],
          "isLiked": false,
          "viewCount": 42,
          "createdAt": "2026-02-08T10:30:00.000Z",
          "type": "media"
        }
      ]
    }
  }
}
```

### When `type=media`

```json
{
  "success": true,
  "data": {
    "metadata": {
      "keyword": "hello",
      "type": "media",
      "page": 1,
      "pageSize": 20,
      "totalDocuments": 23,
      "totalPages": 2
    },
    "results": [
      {
        "_id": "64post789...",
        "userId": "64user123...",
        "user": {
          "_id": "64user123...",
          "fullName": "John Doe",
          "userName": "@johndoe",
          "profilePicture": "https://..."
        },
        "text": "Hello world post",
        "location": "San Francisco",
        "media": [
          {
            "url": "https://...",
            "thumbnailUrl": "https://...",
            "mediaType": "video"
          }
        ],
        "labels": ["travel"],
        "isLiked": true,
        "viewCount": 120,
        "createdAt": "2026-02-08T10:30:00.000Z",
        "updatedAt": "2026-02-08T10:30:00.000Z",
        "type": "media"
      }
    ]
  }
}
```

### When `type` is specific (chats, chits, people, topic)

```json
{
  "success": true,
  "data": {
    "metadata": {
      "keyword": "hello",
      "type": "people",
      "page": 1,
      "pageSize": 20,
      "totalDocuments": 42,
      "totalPages": 3
    },
    "results": [
      {
        "_id": "64user456...",
        "fullName": "Hello User",
        "userName": "@hellouser",
        "profilePicture": "https://...",
        "description": "Hi there!",
        "followers": 150,
        "following": 75,
        "type": "people"
      }
    ]
  }
}
```

---

## Result Object Schemas

### Chats Result (Hashtags)

```typescript
interface ChatResult {
  _id: string;
  name: string;
  description?: string;
  creatorId: string;
  access: 'PUBLIC' | 'PRIVATE' | 'BROADCAST';
  scope: 'GLOBAL' | 'LOCAL';
  fullLocation?: object;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  parentHashtagId?: string;
  profilePicture?: string;
  hashtagPhoto?: string;
  hashtagBanner?: string;
  likeCount?: number;
  viewCount?: number;
  chatroomId: string;
  isSaved: boolean;
  isPinned: boolean;
  createdAt: string;
  type: 'chats';
}
```

### Topic Result (Interest Categories)

```typescript
interface TopicResult {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  backgroundImage?: string;
  order: number;
  type: 'topic';
}
```

### Chits Result

```typescript
interface ChitResult {
  _id: string;
  content: string;
  media?: object[];
  isAudio?: boolean;
  messageType?: string;
  createdAt: string;
  chatroomId: string;
  hashtag: {
    _id: string;
    name: string;
    fullLocation?: object;
    location?: object;
    profilePicture?: string;
  };
  senderDetails: {
    _id: string;
    fullName: string;
    userName: string;
    profilePicture?: string;
  };
  type: 'chits';
}
```

### People Result

```typescript
interface PeopleResult {
  _id: string;
  fullName: string;
  userName: string;
  profilePicture?: string;
  description?: string;
  fullLocation?: object;
  location?: object;
  followers?: number;
  following?: number;
  type: 'people';
}
```

### Media Result (Posts with media)

```typescript
interface MediaResult {
  _id: string;
  userId: string;
  user: {
    _id: string;
    fullName: string;
    userName: string;
    profilePicture?: string;
  };
  text?: string;
  location?: string;
  media: Array<{
    url: string;
    thumbnailUrl?: string;
    mediaType: 'image' | 'video';
  }>;
  labels?: string[];
  isLiked: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  type: 'media';
}
```

---

## Usage Examples

### Search All Categories (Default)

```javascript
// Search for "hello" across all categories, getting 5 results per category
const response = await fetch('/global-search?keyword=hello', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// data.results.chats - array of chat results
// data.results.chits - array of chit/message results
// data.results.people - array of user results
// data.results.topic - array of topic results (same as chats)
```

### Search All with Custom Size

```javascript
// Get 10 results per category instead of 5
const response = await fetch('/global-search?keyword=hello&allSize=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Search Specific Category with Pagination

```javascript
// Search only people, page 2 with 20 results per page
const response = await fetch('/global-search?keyword=john&type=people&pageNum=2&pageSize=20', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// data.metadata.totalDocuments - total number of matching users
// data.metadata.totalPages - total pages available
// data.results - array of people results
```

### Search Chats/Topics

```javascript
// Search for chat rooms/topics containing "gaming"
const response = await fetch('/global-search?keyword=gaming&type=chats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Search Messages (Chits)

```javascript
// Search for messages containing "meeting"
const response = await fetch('/global-search?keyword=meeting&type=chits', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Search Media Posts (all media)

```javascript
// Search for media posts containing "sunset"
const response = await fetch('/global-search?keyword=sunset&type=media&subtype=all', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Search Media Posts (videos only)

```javascript
// Search for video posts containing "sunset"
const response = await fetch('/global-search?keyword=sunset&type=media&subtype=video', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Search Media Posts (images only)

```javascript
// Search for image posts containing "sunset"
const response = await fetch('/global-search?keyword=sunset&type=media&subtype=image', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## Frontend Integration Guide

### 1. Initial Search (Omni-search)

When the user starts typing in a search bar, use `type=all` to show a preview of results from all categories:

```javascript
const searchAll = async (keyword) => {
  if (!keyword || keyword.length < 1) return null;
  
  const params = new URLSearchParams({
    keyword,
    type: 'all',
    allSize: 5 // Show 5 results per category
  });
  
  const response = await fetch(`/global-search?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return response.json();
};
```

### 2. Category-Specific Search

When user selects a specific category or wants to see more results:

```javascript
const searchCategory = async (keyword, type, page = 1, pageSize = 20) => {
  const params = new URLSearchParams({
    keyword,
    type, // 'chats', 'chits', 'people', or 'topic'
    pageNum: page.toString(),
    pageSize: pageSize.toString()
  });
  
  const response = await fetch(`/global-search?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return response.json();
};
```

### 3. UI Implementation Suggestion

```jsx
// React example
function SearchResults({ keyword }) {
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (activeTab === 'all') {
      searchAll(keyword).then(setResults);
    } else {
      searchCategory(keyword, activeTab, page).then(setResults);
    }
  }, [keyword, activeTab, page]);

  return (
    <div>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tab value="all" label="All" />
        <Tab value="chats" label={`Chats (${results?.metadata?.totals?.chats || 0})`} />
        <Tab value="chits" label={`Chits (${results?.metadata?.totals?.chits || 0})`} />
        <Tab value="people" label={`People (${results?.metadata?.totals?.people || 0})`} />
        <Tab value="media" label={`Media (${results?.metadata?.totals?.media || 0})`} />
      </Tabs>

      {activeTab === 'all' ? (
        <>
          <Section title="Chats" items={results?.results?.chats} />
          <Section title="Chits" items={results?.results?.chits} />
          <Section title="People" items={results?.results?.people} />
          <Section title="Media" items={results?.results?.media} />
        </>
      ) : (
        <ResultsList 
          items={results?.results} 
          type={activeTab}
          pagination={results?.metadata}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
```

### 4. Handling the `type` Field

Each result object includes a `type` field indicating its category. Use this to render appropriate UI components:

```javascript
const renderResult = (result) => {
  switch (result.type) {
    case 'chats':
      return <ChatCard chat={result} />;
    case 'chits':
      return <MessageCard message={result} />;
    case 'people':
      return <UserCard user={result} />;
    case 'topic':
      return <TopicCard topic={result} />;
    case 'media':
      return <MediaPostCard post={result} />;
    default:
      return null;
  }
};
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": {
    "message": "Search keyword is required"
  }
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": {
    "message": "Access denied. No token provided."
  }
}
```

---

## Notes

1. **Chits Search Scope**: Messages (chits) are only searched within chatrooms where the current user is a participant.

2. **Blocked Users**: 
   - Results from blocked users are excluded
   - Users who have blocked the current user are also excluded from people search

3. **Cleared Messages**: Messages that the user has cleared are not included in chits search results.

4. **Topic vs Chats**: 
   - `topic` searches **Interest Categories** (e.g., Sports, Music, Gaming)
   - `chats` searches **Hashtags** (chat rooms)
   - These are different entities in the system

5. **Performance**: For `type=all`, results are fetched in parallel for optimal performance.

6. **Media Search**:
   - Only **original posts** are returned (replies with `parentPostId` are excluded)
   - Posts must have at least one media item
   - When `subtype=image` or `subtype=video`, posts are filtered by `media.mediaType`
   - A post with mixed media types (e.g. 1 image + 1 video) will appear for both `subtype=image` and `subtype=video`
   - Each result includes `isLiked` (whether the current user liked the post) and `viewCount`

7. **Related API**: For searching messages within a specific hashtag, use the existing `/chatroom/search-chits` endpoint which accepts a `hashtagId` parameter.
