# Active Users - Frontend Integration Guide

This document provides documentation for getting real-time active user counts in chatrooms.

## Overview

The Active Users feature provides real-time counts of:
- **Total Users**: Total participants in a chatroom
- **Active Users**: Participants who are currently connected to the socket server

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLOW DIAGRAM                                    │
└─────────────────────────────────────────────────────────────────────────────┘

1. User connects to socket ──► Server adds user to Redis "online:users" SET

2. Frontend needs active count:
   emit('activeUsers', { chatroomId, chatroomType })
                     │
                     ▼
3. Server receives request:
   - Gets all participants of the chatroom
   - Checks which participants are in the Redis "online:users" SET
   - Returns counts
                     │
                     ▼
4. Frontend receives:
   on('activeUsersSuccess', { chatroomId, chatroomType, totalUsers, activeUsers })

5. User disconnects from socket ──► Server removes user from Redis SET
```

---

## Socket Events

### Request Active Users

**Event:** `activeUsers`

**Emit:**
```javascript
socket.emit('activeUsers', {
  chatroomId: '69637cfc2e41afbbbb8f36b0',  // Required
  chatroomType: 'private'                   // Required: 'hashtag' or 'private'
});
```

**Listen for Success:**
```javascript
socket.on('activeUsersSuccess', (data) => {
  console.log(data);
  // {
  //   chatroomId: '69637cfc2e41afbbbb8f36b0',
  //   chatroomType: 'private',
  //   totalUsers: 150,    // Total participants in chatroom
  //   activeUsers: 23     // Currently connected to socket
  // }
});
```

**Listen for Error:**
```javascript
socket.on('activeUsersFailed', (error) => {
  console.error(error.message);
  // "chatroomId is required"
  // "chatroomType must be \"hashtag\" or \"private\""
  // "Authentication required"
});
```

---

## Chatroom Types

| Type | Description | What to send as `chatroomId` |
|------|-------------|------------------------------|
| `hashtag` | Hashtag/community chatroom | **Hashtag ID** (from hashtag object `_id`) |
| `private` | Private chat (1:1 or group) | **Private chatroom ID** (from chatroom object `_id`) |

> **Important for Hashtags:** Send the `hashtagId` (hashtag's `_id`), NOT the internal chatroom ID. The server will find the associated chatroom automatically.

---

## Integration Examples

### React Native / React

```typescript
import { useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface ActiveUserCounts {
  totalUsers: number;
  activeUsers: number;
}

export function useActiveUsers(socket: Socket, chatroomId: string, chatroomType: 'hashtag' | 'private') {
  const [counts, setCounts] = useState<ActiveUserCounts>({ totalUsers: 0, activeUsers: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveUsers = useCallback(() => {
    if (!chatroomId || !chatroomType) return;

    setLoading(true);
    setError(null);

    socket.emit('activeUsers', { chatroomId, chatroomType });
  }, [socket, chatroomId, chatroomType]);

  useEffect(() => {
    const handleSuccess = (data: any) => {
      if (data.chatroomId === chatroomId) {
        setCounts({
          totalUsers: data.totalUsers,
          activeUsers: data.activeUsers,
        });
        setLoading(false);
      }
    };

    const handleError = (data: any) => {
      setError(data.message);
      setLoading(false);
    };

    socket.on('activeUsersSuccess', handleSuccess);
    socket.on('activeUsersFailed', handleError);

    // Fetch on mount
    fetchActiveUsers();

    return () => {
      socket.off('activeUsersSuccess', handleSuccess);
      socket.off('activeUsersFailed', handleError);
    };
  }, [socket, chatroomId, fetchActiveUsers]);

  return {
    ...counts,
    loading,
    error,
    refresh: fetchActiveUsers,
  };
}
```

### Usage in Component

```tsx
function ChatHeader({ socket, chatroomId }) {
  const { totalUsers, activeUsers, refresh } = useActiveUsers(socket, chatroomId, 'private');

  // Optional: Refresh periodically
  useEffect(() => {
    const interval = setInterval(refresh, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <View style={styles.header}>
      <Text style={styles.title}>Group Chat</Text>
      <Text style={styles.subtitle}>
        {activeUsers} of {totalUsers} online
      </Text>
    </View>
  );
}
```

### Flutter

```dart
class ActiveUsersService {
  final dynamic socket;
  
  int totalUsers = 0;
  int activeUsers = 0;
  
  final _controller = StreamController<Map<String, int>>.broadcast();
  Stream<Map<String, int>> get countsStream => _controller.stream;
  
  ActiveUsersService(this.socket) {
    socket.on('activeUsersSuccess', (data) {
      totalUsers = data['totalUsers'] ?? 0;
      activeUsers = data['activeUsers'] ?? 0;
      _controller.add({
        'totalUsers': totalUsers,
        'activeUsers': activeUsers,
      });
    });
    
    socket.on('activeUsersFailed', (data) {
      print('Active users error: ${data['message']}');
    });
  }
  
  void fetchActiveUsers(String chatroomId, String chatroomType) {
    socket.emit('activeUsers', {
      'chatroomId': chatroomId,
      'chatroomType': chatroomType,
    });
  }
  
  void dispose() {
    _controller.close();
  }
}
```

---

## When to Fetch

| Scenario | Action |
|----------|--------|
| User opens chatroom | Fetch once |
| User pulls to refresh | Fetch again |
| Periodic refresh (optional) | Every 30-60 seconds |
| User returns to chatroom from background | Fetch again |

---

## Response Format

```typescript
interface ActiveUsersResponse {
  chatroomId: string;       // The chatroom ID you requested
  chatroomType: string;     // 'hashtag' or 'private'
  totalUsers: number;       // Total participants in the chatroom
  activeUsers: number;      // Participants currently connected to socket
}
```

---

## Notes

1. **Active Users** = Users who have an active socket connection to the server
2. **Total Users** = All participants in the chatroom (for hashtag: joined users, for private: all non-exited members)
3. Counts are calculated on-demand when you request them
4. For accurate counts, ensure your app maintains socket connection in the background (or reconnects when foregrounded)

---

## Error Handling

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Authentication required` | Socket not authenticated | Ensure user is logged in |
| `chatroomId is required` | Missing chatroomId | Provide valid chatroomId |
| `chatroomType must be "hashtag" or "private"` | Invalid type | Use 'hashtag' or 'private' |

---

## Changelog

- **v1.0.0** - Initial release
  - On-demand active user counts
  - Redis-based online user tracking
  - Support for hashtag and private chatrooms
