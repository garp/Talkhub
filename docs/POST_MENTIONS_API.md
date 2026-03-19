# Post Mentions Feature

Users can mention other users in post descriptions using `@username` syntax, similar to Instagram and Twitter. Mentioned users receive both in-app notifications and push notifications.

---

## How It Works

1. **User creates a post** with text containing `@username` mentions
2. **Server parses mentions** and extracts all `@username` patterns
3. **Server looks up users** by username in the database
4. **Server stores mentioned user IDs** in the post's `mentions` field
5. **Server creates in-app notifications** for each mentioned user
6. **Server sends push notifications** via FCM to each mentioned user

---

## Mention Syntax

Mentions are detected using the pattern `@username` where:
- Starts with `@` symbol
- Followed by 1-30 characters
- Allowed characters: letters, numbers, underscores, dots
- Case-insensitive matching

### Examples

```
"Hello @john, check this out!"              → mentions: ["john"]
"Thanks @alice and @bob for the help!"      → mentions: ["alice", "bob"]
"Great work @user123 @dev_team @jane.doe"   → mentions: ["user123", "dev_team", "jane.doe"]
"Hey @John @john @JOHN"                     → mentions: ["john"] (deduplicated)
```

---

## API Changes

### Create Post Request

**Endpoint:** `POST /post`

The existing create post endpoint now automatically processes mentions. No changes needed to the request format.

```json
{
  "text": "Amazing sunset photo! Thanks @alice and @bob for joining me 📸",
  "media": [
    {
      "url": "https://cdn.example.com/sunset.jpg",
      "mediaType": "image"
    }
  ],
  "replySettings": "everyone"
}
```

### Create Post Response

The response now includes a `mentions` array with the IDs of mentioned users:

```json
{
  "success": true,
  "data": {
    "post": {
      "_id": "64post123",
      "userId": "64creator456",
      "text": "Amazing sunset photo! Thanks @alice and @bob for joining me 📸",
      "media": [...],
      "mentions": ["64alice789", "64bob012"],
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

---

## Post Model Changes

The Post model now includes a `mentions` field:

```javascript
{
  // ... existing fields ...
  mentions: [{
    type: Schema.Types.ObjectId,
    ref: 'users',
    index: true,
  }]
}
```

---

## Notifications

### In-App Notification

When a user is mentioned, they receive an in-app notification:

```json
{
  "_id": "64notif123",
  "userId": "64alice789",
  "senderId": "64creator456",
  "category": "updates",
  "type": "mention",
  "summary": "John Doe mentioned you in a post",
  "read": false,
  "meta": {
    "kind": "post_mention",
    "postId": "64post123",
    "postPreview": "Amazing sunset photo! Thanks @alice and @bob for joi...",
    "mentionedBy": {
      "_id": "64creator456",
      "userName": "johndoe",
      "fullName": "John Doe",
      "profilePicture": "https://cdn.example.com/johndoe.jpg"
    }
  },
  "createdAt": "2026-01-15T10:30:00.000Z"
}
```

### Push Notification

Mentioned users also receive a push notification via FCM:

```json
{
  "notification": {
    "title": "You were mentioned in a post",
    "body": "John Doe mentioned you: \"Amazing sunset photo! Thanks @alice and @bob for joi...\""
  },
  "data": {
    "type": "mention",
    "postId": "64post123"
  }
}
```

---

## Frontend Integration

### TypeScript Types

```typescript
interface Post {
  _id: string;
  userId: string;
  text: string | null;
  media: Media[];
  mentions: string[]; // Array of mentioned user IDs
  // ... other fields
}

interface MentionNotificationMeta {
  kind: 'post_mention';
  postId: string;
  postPreview: string;
  mentionedBy: {
    _id: string;
    userName: string;
    fullName: string;
    profilePicture: string | null;
  };
}

interface MentionNotification {
  _id: string;
  userId: string;
  senderId: string;
  category: 'updates';
  type: 'mention';
  summary: string;
  read: boolean;
  meta: MentionNotificationMeta;
  createdAt: string;
}
```

### Rendering Mentions in Post Text

To make mentions clickable/tappable in the UI, parse the post text and replace `@username` patterns with styled links:

```typescript
// Utility to parse and render mentions
function renderTextWithMentions(text: string): React.ReactNode {
  if (!text) return null;

  const mentionRegex = /@([a-zA-Z0-9_.]{1,30})\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add the mention as a link
    const username = match[1];
    parts.push(
      <a 
        key={match.index} 
        href={`/profile/${username}`}
        className="mention-link"
      >
        @{username}
      </a>
    );

    lastIndex = mentionRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}
```

### React Component Example

```tsx
import React from 'react';

interface PostProps {
  post: Post;
}

function PostCard({ post }: PostProps) {
  return (
    <div className="post-card">
      <div className="post-header">
        {/* User info */}
      </div>
      
      <div className="post-content">
        <p className="post-text">
          {renderTextWithMentions(post.text)}
        </p>
        
        {/* Media */}
        {post.media?.map((m, idx) => (
          m.mediaType === 'image' 
            ? <img key={idx} src={m.url} alt="" />
            : <video key={idx} src={m.url} controls />
        ))}
      </div>
      
      {/* Show who was mentioned (optional) */}
      {post.mentions && post.mentions.length > 0 && (
        <div className="post-mentions">
          <span className="mentions-label">
            {post.mentions.length} user{post.mentions.length > 1 ? 's' : ''} mentioned
          </span>
        </div>
      )}
    </div>
  );
}
```

### CSS Styling

```css
.mention-link {
  color: #1da1f2;
  text-decoration: none;
  font-weight: 500;
}

.mention-link:hover {
  text-decoration: underline;
}

.post-mentions {
  margin-top: 8px;
  font-size: 12px;
  color: #657786;
}
```

### Handling Push Notifications

When receiving a push notification with `type: "mention"`, navigate to the post:

```typescript
// In your notification handler
messaging().onNotificationOpenedApp((remoteMessage) => {
  const { data } = remoteMessage;
  
  if (data?.type === 'mention' && data?.postId) {
    // Navigate to the post
    navigation.navigate('Post', { postId: data.postId });
  }
});
```

---

## Mention Input Component (Autocomplete)

To provide a good UX, implement mention autocomplete when users type `@`:

```tsx
import React, { useState, useEffect } from 'react';

interface User {
  _id: string;
  userName: string;
  fullName: string;
  profilePicture: string | null;
}

function PostComposer() {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<User[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Detect when user is typing a mention
  useEffect(() => {
    const beforeCursor = text.substring(0, cursorPosition);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionQuery(null);
      setMentionSuggestions([]);
    }
  }, [text, cursorPosition]);

  // Search for users when mention query changes
  useEffect(() => {
    if (mentionQuery !== null && mentionQuery.length >= 1) {
      searchUsers(mentionQuery).then(setMentionSuggestions);
    }
  }, [mentionQuery]);

  const insertMention = (user: User) => {
    const beforeCursor = text.substring(0, cursorPosition);
    const afterCursor = text.substring(cursorPosition);
    const mentionStart = beforeCursor.lastIndexOf('@');
    
    const newText = 
      beforeCursor.substring(0, mentionStart) + 
      `@${user.userName} ` + 
      afterCursor;
    
    setText(newText);
    setMentionQuery(null);
    setMentionSuggestions([]);
  };

  return (
    <div className="post-composer">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCursorPosition(e.target.selectionStart);
        }}
        onSelect={(e) => setCursorPosition(e.target.selectionStart)}
        placeholder="What's happening? Use @ to mention someone"
      />
      
      {/* Mention suggestions dropdown */}
      {mentionSuggestions.length > 0 && (
        <div className="mention-suggestions">
          {mentionSuggestions.map((user) => (
            <div 
              key={user._id} 
              className="mention-suggestion"
              onClick={() => insertMention(user)}
            >
              <img src={user.profilePicture || '/default-avatar.png'} alt="" />
              <div>
                <strong>{user.fullName}</strong>
                <span>@{user.userName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function searchUsers(query: string): Promise<User[]> {
  const response = await fetch(`/search?searchText=${query}&type=users`);
  const data = await response.json();
  return data.data.users || [];
}
```

---

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| Self-mention | Filtered out - users don't get notified when mentioning themselves |
| Duplicate mentions | Deduplicated - `@john @john` creates only one notification |
| Non-existent users | Silently ignored - no error, just not added to mentions array |
| Case sensitivity | Case-insensitive - `@John` and `@john` match the same user |
| Special characters | Only alphanumeric, underscore, and dot allowed in usernames |

---

## Notes

- Notifications are sent asynchronously (fire-and-forget) to avoid slowing down post creation
- Push notifications require the mentioned user to have an FCM token registered
- Maximum 30 characters allowed in a username after the `@` symbol
- Mentions in post edits are NOT re-processed (only on initial creation)
