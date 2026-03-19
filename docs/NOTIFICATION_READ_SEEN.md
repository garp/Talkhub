# Notification Read/Seen Integration Guide

This document describes how to integrate the notification read/seen feature using WebSocket events and REST API endpoints.

---

## Overview

The notification read/seen feature allows users to:
- Mark individual notifications as read
- Mark all/multiple notifications as read (bulk operation)
- Get unread notification count
- Receive real-time updates when notifications are marked as read across devices

---

## Connection Setup

Before using notification events, ensure you have an active socket connection:

```javascript
import { io } from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  query: {
    userId: 'user-id-here',
  },
  auth: {
    token: 'your-auth-token',
  },
});

// Connection success
socket.on('pairSuccess', (data) => {
  console.log('Connected:', data.message);
});

// Connection failed
socket.on('pairFailed', (error) => {
  console.error('Connection failed:', error.message);
});
```

---

## Socket Events

### Event Flow Diagrams

#### Mark Single Notification as Read:
```
┌──────────────┐                              ┌──────────────┐
│   Frontend   │                              │    Server    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  emit('markNotificationRead', { notificationId })
       │────────────────────────────────────────────>│
       │                                             │
       │                              [Update read=true in DB]
       │                                             │
       │  on('markNotificationReadSuccess', { notificationId, read })
       │<────────────────────────────────────────────│
       │                                             │
       │  on('notificationReadUpdate', { notificationId, read })
       │<────────────────────────────────────────────│ (broadcast to all user devices)
       │                                             │
```

#### Mark All Notifications as Read:
```
┌──────────────┐                              ┌──────────────┐
│   Frontend   │                              │    Server    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  emit('markAllNotificationsRead', { type?, category?, notificationIds? })
       │────────────────────────────────────────────>│
       │                                             │
       │                              [Bulk update read=true in DB]
       │                                             │
       │  on('markAllNotificationsReadSuccess', { modifiedCount, filter })
       │<────────────────────────────────────────────│
       │                                             │
       │  on('notificationReadUpdate', { bulkUpdate, modifiedCount, filter })
       │<────────────────────────────────────────────│ (broadcast to all user devices)
       │                                             │
```

#### Get Unread Count:
```
┌──────────────┐                              ┌──────────────┐
│   Frontend   │                              │    Server    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  emit('getUnreadNotificationCount', { type?, category? })
       │────────────────────────────────────────────>│
       │                                             │
       │                              [Count unread in DB]
       │                                             │
       │  on('getUnreadNotificationCountSuccess', { count, filter })
       │<────────────────────────────────────────────│
       │                                             │
```

---

## Socket Events Reference

### 1. `markNotificationRead` (Client → Server)

Emit this event to mark a single notification as read.

**Payload:**

| Field            | Type   | Required | Description                              |
|------------------|--------|----------|------------------------------------------|
| `notificationId` | String | Yes      | The MongoDB ObjectId of the notification |

**Example:**

```javascript
socket.emit('markNotificationRead', {
  notificationId: '507f1f77bcf86cd799439011'
});
```

---

### 2. `markNotificationReadSuccess` (Server → Client)

Received when the notification was successfully marked as read.

**Response Payload:**

| Field            | Type    | Description                                      |
|------------------|---------|--------------------------------------------------|
| `notificationId` | String  | The notification ID that was updated             |
| `read`           | Boolean | Always `true` when successful                    |
| `alreadyRead`    | Boolean | `true` if notification was already read          |
| `message`        | String  | Optional message (when already read or not found)|

**Example:**

```javascript
socket.on('markNotificationReadSuccess', (data) => {
  if (data.alreadyRead) {
    console.log('Notification was already read');
  } else {
    console.log(`Notification ${data.notificationId} marked as read`);
  }
});
```

---

### 3. `markNotificationReadFailed` (Server → Client)

Received when marking a notification as read fails.

**Response Payload:**

| Field     | Type   | Description       |
|-----------|--------|-------------------|
| `message` | String | Error description |

**Possible Error Messages:**

- `"User ID is required."` - Socket connection missing userId
- `"Valid notification ID is required."` - Invalid or missing notificationId
- `"Failed to mark notification as read."` - Server error

**Example:**

```javascript
socket.on('markNotificationReadFailed', (error) => {
  console.error('Failed to mark as read:', error.message);
});
```

---

### 4. `markAllNotificationsRead` (Client → Server)

Emit this event to mark multiple notifications as read.

**Payload:**

| Field             | Type     | Required | Description                                                    |
|-------------------|----------|----------|----------------------------------------------------------------|
| `notificationIds` | String[] | No*      | Array of notification IDs to mark as read (max 100)            |
| `type`            | String   | No*      | Filter by notification type                                    |
| `category`        | String   | No*      | Filter by notification category                                |

> *At least one of `notificationIds`, `type`, or `category` should be provided for targeted updates. If none provided, all unread notifications will be marked as read.

**Valid Types:**
- `follow`, `unfollow`, `hashtag_message`, `ai_summary`, `alert`, `news`, `update`, `mention`

**Valid Categories:**
- `ai`, `follows`, `alerts`, `news`, `updates`, `chats`

**Examples:**

```javascript
// Mark specific notifications as read
socket.emit('markAllNotificationsRead', {
  notificationIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
});

// Mark all "follow" type notifications as read
socket.emit('markAllNotificationsRead', {
  type: 'follow'
});

// Mark all notifications in "alerts" category as read
socket.emit('markAllNotificationsRead', {
  category: 'alerts'
});

// Mark ALL unread notifications as read
socket.emit('markAllNotificationsRead', {});
```

---

### 5. `markAllNotificationsReadSuccess` (Server → Client)

Received when bulk marking notifications as read succeeds.

**Response Payload:**

| Field           | Type   | Description                                   |
|-----------------|--------|-----------------------------------------------|
| `modifiedCount` | Number | Number of notifications marked as read        |
| `filter`        | Object | The filter that was applied                   |

**Example:**

```javascript
socket.on('markAllNotificationsReadSuccess', (data) => {
  console.log(`${data.modifiedCount} notifications marked as read`);
  console.log('Filter used:', data.filter);
});
```

---

### 6. `markAllNotificationsReadFailed` (Server → Client)

Received when bulk marking fails.

**Response Payload:**

| Field     | Type   | Description       |
|-----------|--------|-------------------|
| `message` | String | Error description |

**Example:**

```javascript
socket.on('markAllNotificationsReadFailed', (error) => {
  console.error('Bulk mark as read failed:', error.message);
});
```

---

### 7. `getUnreadNotificationCount` (Client → Server)

Emit this event to get the count of unread notifications.

**Payload:**

| Field      | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `type`     | String | No       | Filter count by notification type |
| `category` | String | No       | Filter count by category        |

**Examples:**

```javascript
// Get total unread count
socket.emit('getUnreadNotificationCount', {});

// Get unread count for "follow" type
socket.emit('getUnreadNotificationCount', {
  type: 'follow'
});

// Get unread count for "alerts" category
socket.emit('getUnreadNotificationCount', {
  category: 'alerts'
});
```

---

### 8. `getUnreadNotificationCountSuccess` (Server → Client)

Received with the unread notification count.

**Response Payload:**

| Field    | Type   | Description                    |
|----------|--------|--------------------------------|
| `count`  | Number | Number of unread notifications |
| `filter` | Object | The filter that was applied    |

**Example:**

```javascript
socket.on('getUnreadNotificationCountSuccess', (data) => {
  console.log(`You have ${data.count} unread notifications`);
  // Update badge/counter in UI
  updateNotificationBadge(data.count);
});
```

---

### 9. `getUnreadNotificationCountFailed` (Server → Client)

Received when getting unread count fails.

**Response Payload:**

| Field     | Type   | Description       |
|-----------|--------|-------------------|
| `message` | String | Error description |

---

### 10. `notificationReadUpdate` (Server → Client) - Real-time Broadcast

This event is broadcast to ALL connected devices of the user when notifications are marked as read. Use this to sync notification state across devices.

**Response Payload (Single Notification):**

| Field            | Type    | Description                      |
|------------------|---------|----------------------------------|
| `notificationId` | String  | The notification ID that was read|
| `read`           | Boolean | Always `true`                    |

**Response Payload (Bulk Update):**

| Field           | Type    | Description                            |
|-----------------|---------|----------------------------------------|
| `bulkUpdate`    | Boolean | Always `true` for bulk operations      |
| `modifiedCount` | Number  | Number of notifications marked as read |
| `filter`        | Object  | The filter that was applied            |

**Example:**

```javascript
socket.on('notificationReadUpdate', (data) => {
  if (data.bulkUpdate) {
    // Bulk update - refresh notification list or update counts
    console.log(`${data.modifiedCount} notifications marked as read`);
    refreshNotificationList();
    fetchUnreadCount();
  } else {
    // Single notification update
    console.log(`Notification ${data.notificationId} marked as read`);
    updateNotificationInList(data.notificationId, { read: true });
    decrementUnreadCount();
  }
});
```

---

## REST API Endpoints

### 1. Get Unread Notification Count

**Endpoint:** `GET /notifications/unread-count`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter  | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `type`     | String | No       | Filter by notification type     |
| `category` | String | No       | Filter by notification category |

**Example Request:**

```bash
# Get total unread count
curl -X GET "https://api.example.com/notifications/unread-count" \
  -H "Authorization: Bearer <token>"

# Get unread count for "follow" type
curl -X GET "https://api.example.com/notifications/unread-count?type=follow" \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "data": {
    "count": 5,
    "filter": {
      "type": null,
      "category": null
    }
  }
}
```

---

### 2. Mark Single Notification as Read

**Endpoint:** `PATCH /notifications/:notificationId/read`

**Headers:**
```
Authorization: Bearer <token>
```

**Path Parameters:**

| Parameter        | Type   | Required | Description                  |
|------------------|--------|----------|------------------------------|
| `notificationId` | String | Yes      | MongoDB ObjectId of notification |

**Example Request:**

```bash
curl -X PATCH "https://api.example.com/notifications/507f1f77bcf86cd799439011/read" \
  -H "Authorization: Bearer <token>"
```

**Success Response:**

```json
{
  "data": {
    "notificationId": "507f1f77bcf86cd799439011",
    "read": true
  }
}
```

**Already Read Response:**

```json
{
  "data": {
    "notificationId": "507f1f77bcf86cd799439011",
    "alreadyRead": true,
    "message": "Notification already read or not found."
  }
}
```

---

### 3. Mark Multiple Notifications as Read (Bulk)

**Endpoint:** `POST /notifications/mark-read`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body Parameters:**

| Parameter         | Type     | Required | Description                                       |
|-------------------|----------|----------|---------------------------------------------------|
| `notificationIds` | String[] | No*      | Array of notification IDs (max 100)               |
| `type`            | String   | No*      | Filter by notification type                       |
| `category`        | String   | No*      | Filter by notification category                   |
| `markAll`         | Boolean  | No*      | Set to `true` to mark all unread as read          |

> *At least one of these parameters must be provided.

**Example Requests:**

```bash
# Mark specific notifications
curl -X POST "https://api.example.com/notifications/mark-read" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
  }'

# Mark all "follow" type notifications
curl -X POST "https://api.example.com/notifications/mark-read" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "follow"
  }'

# Mark ALL unread notifications
curl -X POST "https://api.example.com/notifications/mark-read" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "markAll": true
  }'
```

**Response:**

```json
{
  "data": {
    "modifiedCount": 3,
    "filter": {
      "notificationIds": null,
      "type": "follow",
      "category": null
    }
  }
}
```

---

## Complete Integration Example

### React Example

```jsx
import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Initialize socket (do this once in your app)
const socket = io('YOUR_SERVER_URL', {
  query: { userId: 'current-user-id' },
  auth: { token: 'auth-token' },
});

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Get initial unread count
    socket.emit('getUnreadNotificationCount', {});

    // Listen for count updates
    socket.on('getUnreadNotificationCountSuccess', (data) => {
      setUnreadCount(data.count);
    });

    // Listen for real-time read updates (from other devices)
    socket.on('notificationReadUpdate', (data) => {
      if (data.bulkUpdate) {
        // Refresh count after bulk update
        socket.emit('getUnreadNotificationCount', {});
      } else {
        // Decrement count for single notification
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });

    // Listen for new notifications (existing event)
    socket.on('getNotificationSuccess', (data) => {
      if (data.action === 'new') {
        setUnreadCount((prev) => prev + 1);
      }
    });

    return () => {
      socket.off('getUnreadNotificationCountSuccess');
      socket.off('notificationReadUpdate');
      socket.off('getNotificationSuccess');
    };
  }, []);

  return (
    <div className="notification-bell">
      <BellIcon />
      {unreadCount > 0 && (
        <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </div>
  );
}

function NotificationList() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Fetch notifications
    socket.emit('getNotification', { page: 1, limit: 20 });

    socket.on('getNotificationSuccess', (data) => {
      if (data.action === 'new') {
        // New notification received
        setNotifications((prev) => [data.notification, ...prev]);
      } else if (data.notifications) {
        // Initial load or pagination
        setNotifications(data.notifications);
      }
    });

    socket.on('notificationReadUpdate', (data) => {
      if (data.bulkUpdate) {
        // Mark all matching as read
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true }))
        );
      } else {
        // Mark single as read
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === data.notificationId ? { ...n, read: true } : n
          )
        );
      }
    });

    return () => {
      socket.off('getNotificationSuccess');
      socket.off('notificationReadUpdate');
    };
  }, []);

  const markAsRead = useCallback((notificationId) => {
    socket.emit('markNotificationRead', { notificationId });
  }, []);

  const markAllAsRead = useCallback(() => {
    socket.emit('markAllNotificationsRead', {});
  }, []);

  return (
    <div className="notification-list">
      <div className="header">
        <h3>Notifications</h3>
        <button onClick={markAllAsRead}>Mark all as read</button>
      </div>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification._id}
          notification={notification}
          onMarkAsRead={markAsRead}
        />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onMarkAsRead }) {
  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification._id);
    }
    // Navigate to relevant content
  };

  return (
    <div
      className={`notification-item ${notification.read ? '' : 'unread'}`}
      onClick={handleClick}
    >
      <div className="content">
        <p>{notification.summary}</p>
        <span className="time">{formatTime(notification.createdAt)}</span>
      </div>
      {!notification.read && <span className="unread-dot" />}
    </div>
  );
}
```

### React Native Example

```jsx
import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { io } from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  query: { userId: 'current-user-id' },
  auth: { token: 'auth-token' },
});

function NotificationScreen() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial data
    socket.emit('getNotification', { page: 1, limit: 20 });
    socket.emit('getUnreadNotificationCount', {});

    const handleNotifications = (data) => {
      setLoading(false);
      if (data.action === 'new') {
        setNotifications((prev) => [data.notification, ...prev]);
        setUnreadCount((prev) => prev + 1);
      } else if (data.notifications) {
        setNotifications(data.notifications);
      }
    };

    const handleUnreadCount = (data) => {
      setUnreadCount(data.count);
    };

    const handleReadUpdate = (data) => {
      if (data.bulkUpdate) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      } else {
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === data.notificationId ? { ...n, read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    };

    socket.on('getNotificationSuccess', handleNotifications);
    socket.on('getUnreadNotificationCountSuccess', handleUnreadCount);
    socket.on('notificationReadUpdate', handleReadUpdate);

    return () => {
      socket.off('getNotificationSuccess', handleNotifications);
      socket.off('getUnreadNotificationCountSuccess', handleUnreadCount);
      socket.off('notificationReadUpdate', handleReadUpdate);
    };
  }, []);

  const markAsRead = useCallback((notificationId) => {
    socket.emit('markNotificationRead', { notificationId });
  }, []);

  const markAllAsRead = useCallback(() => {
    socket.emit('markAllNotificationsRead', {});
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, !item.read && styles.unread]}
      onPress={() => {
        if (!item.read) markAsRead(item._id);
      }}
    >
      <Text style={styles.summary}>{item.summary}</Text>
      {!item.read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications ({unreadCount} unread)</Text>
        <TouchableOpacity onPress={markAllAsRead}>
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        refreshing={loading}
      />
    </View>
  );
}
```

---

## Best Practices

### 1. Optimistic UI Updates

Mark notifications as read immediately in the UI while waiting for server confirmation:

```javascript
const markAsRead = (notificationId) => {
  // Optimistic update
  setNotifications((prev) =>
    prev.map((n) =>
      n._id === notificationId ? { ...n, read: true } : n
    )
  );
  setUnreadCount((prev) => Math.max(0, prev - 1));

  // Emit to server
  socket.emit('markNotificationRead', { notificationId });
};

// Handle potential failure
socket.on('markNotificationReadFailed', (error) => {
  // Revert optimistic update
  console.error('Failed:', error.message);
  // Refresh notifications from server
  socket.emit('getNotification', { page: 1, limit: 20 });
  socket.emit('getUnreadNotificationCount', {});
});
```

### 2. Mark as Read on View

Automatically mark notifications as read when the user opens them:

```javascript
const NotificationItem = ({ notification }) => {
  useEffect(() => {
    // Mark as read when component mounts (notification is viewed)
    if (!notification.read) {
      socket.emit('markNotificationRead', { notificationId: notification._id });
    }
  }, [notification._id, notification.read]);

  return (/* ... */);
};
```

### 3. Batch Updates for Performance

When marking multiple notifications, prefer bulk operations:

```javascript
// Good: Single bulk request
socket.emit('markAllNotificationsRead', {
  notificationIds: ['id1', 'id2', 'id3']
});

// Avoid: Multiple individual requests
notificationIds.forEach((id) => {
  socket.emit('markNotificationRead', { notificationId: id });
});
```

### 4. Handle Reconnection

Refresh notification state on socket reconnection:

```javascript
socket.on('connect', () => {
  // Refresh unread count on reconnection
  socket.emit('getUnreadNotificationCount', {});
});
```

---

## Data Model

### Notification Schema

```javascript
{
  _id: ObjectId,
  userId: ObjectId,           // Recipient user
  senderId: ObjectId,         // Actor/sender (optional)
  chatroomId: ObjectId,       // Related chatroom (optional)
  category: String,           // 'ai' | 'follows' | 'alerts' | 'news' | 'updates' | 'chats'
  type: String,               // 'follow' | 'unfollow' | 'hashtag_message' | 'ai_summary' | 'alert' | 'news' | 'update' | 'mention'
  summary: String,            // Notification text
  read: Boolean,              // true = seen, false = unread (default)
  meta: Object,               // Additional data
  createdAt: Date,
  updatedAt: Date
}
```

---

## Events Summary

| Event                              | Direction        | Description                                    |
|------------------------------------|------------------|------------------------------------------------|
| `markNotificationRead`             | Client → Server  | Mark single notification as read               |
| `markNotificationReadSuccess`      | Server → Client  | Confirmation of single mark as read            |
| `markNotificationReadFailed`       | Server → Client  | Error for single mark as read                  |
| `markAllNotificationsRead`         | Client → Server  | Mark multiple/all notifications as read        |
| `markAllNotificationsReadSuccess`  | Server → Client  | Confirmation of bulk mark as read              |
| `markAllNotificationsReadFailed`   | Server → Client  | Error for bulk mark as read                    |
| `getUnreadNotificationCount`       | Client → Server  | Request unread notification count              |
| `getUnreadNotificationCountSuccess`| Server → Client  | Response with unread count                     |
| `getUnreadNotificationCountFailed` | Server → Client  | Error getting unread count                     |
| `notificationReadUpdate`           | Server → Client  | Real-time broadcast when notifications are read|

---

## REST API Summary

| Endpoint                              | Method | Description                      |
|---------------------------------------|--------|----------------------------------|
| `/notifications/unread-count`         | GET    | Get unread notification count    |
| `/notifications/:notificationId/read` | PATCH  | Mark single notification as read |
| `/notifications/mark-read`            | POST   | Mark multiple notifications as read |

---

## Support

For questions or issues, contact the backend team.
