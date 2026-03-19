# Stories Feed API - Frontend Integration Guide

## Overview

The `/user/stories-update` endpoint provides an Instagram-like stories feed for the logged-in user. It returns the user's own stories along with stories from users they follow, all within the last 24 hours.

---

## Endpoint Details

| Property           | Value                   |
| ------------------ | ----------------------- |
| **URL**            | `/user/stories-update`  |
| **Method**         | `GET`                   |
| **Authentication** | Required (Bearer Token) |
| **Content-Type**   | `application/json`      |

---

## Request

### Headers

```http
Authorization: Bearer <access_token>
```

### Query Parameters

None required.

### Example Request

```javascript
// Using fetch
const response = await fetch('https://api.example.com/user/stories-update', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

```javascript
// Using axios
const { data } = await axios.get('/user/stories-update', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "ownStories": {
    "userId": "507f1f77bcf86cd799439011",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "fullName": "John Doe",
      "userName": "johndoe",
      "profilePicture": "https://cdn.example.com/profiles/john.jpg"
    },
    "stories": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "storyUrl": "https://cdn.example.com/stories/story1.jpg",
        "thumbnailUrl": "https://cdn.example.com/stories/story1_thumb.jpg",
        "type": "image",
        "isHighlight": false,
        "createdAt": "2026-02-02T10:30:00.000Z",
        "updatedAt": "2026-02-02T10:30:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "storyUrl": "https://cdn.example.com/stories/story2.mp4",
        "thumbnailUrl": "https://cdn.example.com/stories/story2_thumb.jpg",
        "type": "video",
        "isHighlight": false,
        "createdAt": "2026-02-02T09:00:00.000Z",
        "updatedAt": "2026-02-02T09:00:00.000Z"
      }
    ],
    "storyCount": 2,
    "latestStoryAt": "2026-02-02T10:30:00.000Z",
    "isOwnStory": true
  },
  "stories": [
    {
      "userId": "507f1f77bcf86cd799439014",
      "user": {
        "_id": "507f1f77bcf86cd799439014",
        "fullName": "Jane Smith",
        "userName": "janesmith",
        "profilePicture": "https://cdn.example.com/profiles/jane.jpg"
      },
      "stories": [
        {
          "_id": "507f1f77bcf86cd799439015",
          "storyUrl": "https://cdn.example.com/stories/jane_story.jpg",
          "thumbnailUrl": "https://cdn.example.com/stories/jane_story_thumb.jpg",
          "type": "image",
          "isHighlight": false,
          "createdAt": "2026-02-02T08:00:00.000Z",
          "updatedAt": "2026-02-02T08:00:00.000Z"
        }
      ],
      "storyCount": 1,
      "latestStoryAt": "2026-02-02T08:00:00.000Z",
      "isOwnStory": false
    }
  ],
  "totalUsers": 2,
  "hasOwnStory": true
}
```

### Response When User Has No Stories

```json
{
  "success": true,
  "ownStories": null,
  "stories": [
    {
      "userId": "507f1f77bcf86cd799439014",
      "user": {
        "_id": "507f1f77bcf86cd799439014",
        "fullName": "Jane Smith",
        "userName": "janesmith",
        "profilePicture": "https://cdn.example.com/profiles/jane.jpg"
      },
      "stories": [...],
      "storyCount": 1,
      "latestStoryAt": "2026-02-02T08:00:00.000Z",
      "isOwnStory": false
    }
  ],
  "totalUsers": 1,
  "hasOwnStory": false
}
```

### Empty Response (No Stories Available)

```json
{
  "success": true,
  "ownStories": null,
  "stories": [],
  "totalUsers": 0,
  "hasOwnStory": false
}
```

---

## Response Fields

### Root Level

| Field         | Type             | Description                                         |
| ------------- | ---------------- | --------------------------------------------------- |
| `success`     | `boolean`        | Indicates if the request was successful             |
| `ownStories`  | `object \| null` | Logged-in user's stories (null if no stories)       |
| `stories`     | `array`          | Array of story groups from followed users           |
| `totalUsers`  | `number`         | Total number of users with stories (including self) |
| `hasOwnStory` | `boolean`        | Quick check if logged-in user has any stories       |

### Story Group Object (ownStories / stories[])

| Field                 | Type      | Description                                    |
| --------------------- | --------- | ---------------------------------------------- |
| `userId`              | `string`  | MongoDB ObjectId of the story owner            |
| `user`                | `object`  | User profile information                       |
| `user._id`            | `string`  | User's MongoDB ObjectId                        |
| `user.fullName`       | `string`  | User's display name                            |
| `user.userName`       | `string`  | User's username/handle                         |
| `user.profilePicture` | `string`  | URL to user's profile picture                  |
| `stories`             | `array`   | Array of individual stories                    |
| `storyCount`          | `number`  | Number of stories from this user               |
| `latestStoryAt`       | `string`  | ISO timestamp of the most recent story         |
| `isOwnStory`          | `boolean` | `true` if this is the logged-in user's stories |

### Individual Story Object (stories[].stories[])

| Field          | Type      | Description                                    |
| -------------- | --------- | ---------------------------------------------- |
| `_id`          | `string`  | Unique story identifier                        |
| `storyUrl`     | `string`  | URL to the story media (image/video)           |
| `thumbnailUrl` | `string`  | URL to thumbnail (same as storyUrl for images) |
| `type`         | `string`  | Media type: `"image"` or `"video"`             |
| `isHighlight`  | `boolean` | Whether story is saved as a highlight          |
| `createdAt`    | `string`  | ISO timestamp when story was created           |
| `updatedAt`    | `string`  | ISO timestamp of last update                   |

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Access token is required"
}
```

### 403 Forbidden (Invalid/Expired Token)

```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Frontend Implementation Guide

### 1. Displaying Stories (Instagram-like UI)

```jsx
// React Example
function StoriesBar({ ownStories, stories, hasOwnStory }) {
  return (
    <div className="stories-container">
      {/* Own Story - Always first (with add button if no story) */}
      <StoryCircle
        user={ownStories?.user || currentUser}
        stories={ownStories?.stories || []}
        isOwn={true}
        hasStory={hasOwnStory}
      />
      
      {/* Following Users' Stories */}
      {stories.map((storyGroup) => (
        <StoryCircle
          key={storyGroup.userId}
          user={storyGroup.user}
          stories={storyGroup.stories}
          isOwn={false}
          hasStory={true}
        />
      ))}
    </div>
  );
}
```

### 2. Story Circle Component

```jsx
function StoryCircle({ user, stories, isOwn, hasStory }) {
  const hasUnseenStories = checkUnseenStories(stories); // Implement locally
  
  return (
    <div 
      className={`story-circle ${hasUnseenStories ? 'unseen' : 'seen'}`}
      onClick={() => openStoryViewer(user, stories)}
    >
      <img 
        src={user.profilePicture} 
        alt={user.fullName}
        className="story-avatar"
      />
      {isOwn && !hasStory && (
        <div className="add-story-button">+</div>
      )}
      <span className="username">{user.userName}</span>
    </div>
  );
}
```

### 3. Tracking Viewed Stories (Local Storage)

```javascript
// Store viewed story IDs locally
const VIEWED_STORIES_KEY = 'viewedStories';

function markStoryAsViewed(storyId) {
  const viewed = JSON.parse(localStorage.getItem(VIEWED_STORIES_KEY) || '{}');
  viewed[storyId] = Date.now();
  localStorage.setItem(VIEWED_STORIES_KEY, JSON.stringify(viewed));
}

function isStoryViewed(storyId) {
  const viewed = JSON.parse(localStorage.getItem(VIEWED_STORIES_KEY) || '{}');
  return !!viewed[storyId];
}

function checkUnseenStories(stories) {
  return stories.some(story => !isStoryViewed(story._id));
}

// Clean up old entries (older than 24 hours)
function cleanupViewedStories() {
  const viewed = JSON.parse(localStorage.getItem(VIEWED_STORIES_KEY) || '{}');
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  const cleaned = Object.fromEntries(
    Object.entries(viewed).filter(([_, timestamp]) => timestamp > oneDayAgo)
  );
  
  localStorage.setItem(VIEWED_STORIES_KEY, JSON.stringify(cleaned));
}
```

### 4. Story Viewer Component

```jsx
function StoryViewer({ storyGroups, initialUserIndex = 0 }) {
  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  
  const currentGroup = storyGroups[currentUserIndex];
  const currentStory = currentGroup.stories[currentStoryIndex];
  
  useEffect(() => {
    // Mark story as viewed when displayed
    markStoryAsViewed(currentStory._id);
  }, [currentStory._id]);
  
  const goToNextStory = () => {
    if (currentStoryIndex < currentGroup.stories.length - 1) {
      // Next story from same user
      setCurrentStoryIndex(prev => prev + 1);
    } else if (currentUserIndex < storyGroups.length - 1) {
      // Next user's stories
      setCurrentUserIndex(prev => prev + 1);
      setCurrentStoryIndex(0);
    } else {
      // End of all stories
      closeViewer();
    }
  };
  
  return (
    <div className="story-viewer">
      {/* Progress bars */}
      <div className="progress-bars">
        {currentGroup.stories.map((_, index) => (
          <div 
            key={index}
            className={`progress-bar ${index < currentStoryIndex ? 'complete' : ''} ${index === currentStoryIndex ? 'active' : ''}`}
          />
        ))}
      </div>
      
      {/* User info header */}
      <div className="story-header">
        <img src={currentGroup.user.profilePicture} alt="" />
        <span>{currentGroup.user.userName}</span>
        <span className="time">{formatTimeAgo(currentStory.createdAt)}</span>
      </div>
      
      {/* Story content */}
      {currentStory.type === 'video' ? (
        <video src={currentStory.storyUrl} autoPlay onEnded={goToNextStory} />
      ) : (
        <img src={currentStory.storyUrl} alt="" />
      )}
      
      {/* Navigation areas */}
      <div className="nav-left" onClick={goToPrevStory} />
      <div className="nav-right" onClick={goToNextStory} />
    </div>
  );
}
```

### 5. Polling for Updates

```javascript
// Poll for new stories every 30 seconds
useEffect(() => {
  const fetchStories = async () => {
    const data = await api.get('/user/stories-update');
    setStoriesData(data);
  };
  
  fetchStories(); // Initial fetch
  
  const interval = setInterval(fetchStories, 30000); // Poll every 30s
  
  return () => clearInterval(interval);
}, []);
```

---

## Key Behaviors

| Behavior                   | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| **24-hour expiration**     | Only stories from the last 24 hours are returned          |
| **Own stories first**      | Logged-in user's stories always appear first              |
| **Sorted by recency**      | Other users sorted by their most recent story             |
| **Blocked users excluded** | Stories from blocked users are not included               |
| **Muted users excluded**   | Stories from muted users are not included                 |
| **Only accepted follows**  | Only shows stories from users with accepted follow status |

---

## Related Endpoints

| Endpoint                            | Method | Description                             |
| ----------------------------------- | ------ | --------------------------------------- |
| `POST /stories`                     | POST   | Create a new story (upload image/video) |
| `GET /stories`                      | GET    | Get stories by specific user or hashtag |
| `DELETE /stories/:storyId`          | DELETE | Delete a story                          |
| `PATCH /stories/:storyId/highlight` | PATCH  | Add story to highlights                 |

---

## Notes

- Stories automatically expire after 24 hours (no deletion needed)
- Video thumbnails are auto-generated on upload
- Profile pictures may be null - use a default avatar
- The `storyUrl` for videos points to the video file, use `thumbnailUrl` for preview
