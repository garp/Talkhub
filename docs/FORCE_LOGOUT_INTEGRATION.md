# Force Logout Feature - Frontend Integration Guide

This document explains how to integrate the admin force-logout feature in your frontend application.

## Overview

When an admin triggers a force logout for a user, the server:
1. Emits a `forceLogout` event to all active socket connections for that user
2. Disconnects all their sockets
3. Sets their `onlineStatus` to `false`
4. **Increments `tokenVersion`** - This invalidates ALL existing JWT tokens for that user

The frontend must listen for this event and handle it appropriately.

## How Token Invalidation Works

The JWT token now contains a `tokenVersion` field. When force logout is triggered:
1. Server increments user's `tokenVersion` in the database
2. On every API/socket request, the server compares the token's `tokenVersion` with the database
3. If they don't match, the request is rejected with `401 Unauthorized`

**This means:**
- User will be logged out immediately from all devices
- All existing tokens become invalid instantly
- User must login again to get a new token with the updated `tokenVersion`

---

## API Endpoint (Admin)

```
POST /api/user/admin/force-logout/:userId
Authorization: Bearer <admin_token>
```

### Response
```json
{
  "success": true,
  "message": "User 6789abc123def456 has been logged out successfully",
  "disconnectedSockets": 2,
  "userId": "6789abc123def456"
}
```

---

## Frontend Changes Required

### 1. Listen for `forceLogout` Event

Add a listener for the `forceLogout` event on your socket connection.

#### React / React Native Example

```javascript
// In your socket initialization file (e.g., socketService.js)
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage'; // React Native
// or for web: use localStorage

class SocketService {
  socket = null;
  
  connect(token) {
    this.socket = io(SOCKET_URL, {
      query: { token: `Bearer ${token}` },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('pairSuccess', (data) => {
      console.log('Paired successfully:', data);
    });

    // ✅ Add this listener for force logout
    this.socket.on('forceLogout', (data) => {
      this.handleForceLogout(data);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
  }

  handleForceLogout(data) {
    console.log('Force logout received:', data);
    // data = { message: 'You have been logged out by an administrator', reason: 'admin_force_logout' }
    
    // 1. Clear stored tokens/credentials
    this.clearAuthData();
    
    // 2. Show notification to user
    this.showLogoutNotification(data.message);
    
    // 3. Navigate to login screen
    this.navigateToLogin();
  }

  async clearAuthData() {
    // React Native
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'userId', 'userData']);
    
    // Web
    // localStorage.removeItem('accessToken');
    // localStorage.removeItem('refreshToken');
    // localStorage.removeItem('userId');
    // localStorage.removeItem('userData');
  }

  showLogoutNotification(message) {
    // Using your preferred notification library
    // React Native: Alert.alert('Session Ended', message);
    // Web: toast.error(message) or similar
  }

  navigateToLogin() {
    // React Native with React Navigation:
    // navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    
    // Web with React Router:
    // window.location.href = '/login';
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SocketService();
```

---

### 2. React Native Complete Example

```javascript
// src/services/socketService.js
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { navigationRef } from '../navigation/RootNavigation';
import { CommonActions } from '@react-navigation/native';
import { store } from '../redux/store';
import { logout } from '../redux/slices/authSlice';

const SOCKET_URL = 'https://your-api-url.com';

class SocketService {
  socket = null;

  async connect() {
    const token = await AsyncStorage.getItem('accessToken');
    
    if (!token) {
      console.log('No token found, cannot connect socket');
      return;
    }

    this.socket = io(SOCKET_URL, {
      query: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('pairSuccess', (data) => {
      console.log('Socket paired:', data);
    });

    this.socket.on('pairFailed', (data) => {
      console.log('Socket pair failed:', data);
      this.handleAuthError();
    });

    // ✅ Force logout handler
    this.socket.on('forceLogout', (data) => {
      console.log('Force logout received:', data);
      this.handleForceLogout(data);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.log('Socket connection error:', error.message);
      if (error.message.includes('Authentication error')) {
        this.handleAuthError();
      }
    });
  }

  async handleForceLogout(data) {
    // 1. Disconnect socket
    this.disconnect();

    // 2. Clear all stored auth data
    await AsyncStorage.multiRemove([
      'accessToken',
      'refreshToken',
      'userId',
      'userData',
    ]);

    // 3. Clear Redux state
    store.dispatch(logout());

    // 4. Show alert to user
    Alert.alert(
      'Session Ended',
      data.message || 'You have been logged out by an administrator.',
      [
        {
          text: 'OK',
          onPress: () => {
            // 5. Navigate to login screen
            navigationRef.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Auth', params: { screen: 'Login' } }],
              })
            );
          },
        },
      ],
      { cancelable: false }
    );
  }

  async handleAuthError() {
    await this.handleForceLogout({ 
      message: 'Your session has expired. Please login again.' 
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Helper to emit events
  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  // Helper to listen for events
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event) {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

export default new SocketService();
```

---

### 3. React Web Example

```javascript
// src/services/socketService.js
import { io } from 'socket.io-client';
import { toast } from 'react-toastify'; // or your preferred toast library

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL;

class SocketService {
  socket = null;

  connect() {
    const token = localStorage.getItem('accessToken');
    
    if (!token) {
      console.log('No token found');
      return;
    }

    this.socket = io(SOCKET_URL, {
      query: { token: `Bearer ${token}` },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('pairSuccess', (data) => {
      console.log('Paired:', data);
    });

    // ✅ Force logout handler
    this.socket.on('forceLogout', (data) => {
      this.handleForceLogout(data);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });
  }

  handleForceLogout(data) {
    // 1. Disconnect socket
    this.disconnect();

    // 2. Clear localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userData');

    // 3. Show notification
    toast.warning(data.message || 'You have been logged out by an administrator.', {
      position: 'top-center',
      autoClose: 5000,
    });

    // 4. Redirect to login
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SocketService();
```

---

### 4. Redux Integration (Optional)

If using Redux for state management:

```javascript
// authSlice.js
import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    isAuthenticated: false,
    user: null,
    token: null,
    forceLogoutReason: null,
  },
  reducers: {
    loginSuccess: (state, action) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.forceLogoutReason = null;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
    },
    forceLogout: (state, action) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.forceLogoutReason = action.payload.reason || 'admin_force_logout';
    },
  },
});

export const { loginSuccess, logout, forceLogout } = authSlice.actions;
export default authSlice.reducer;
```

---

## Event Payload

The `forceLogout` event sends the following data:

```javascript
{
  message: "You have been logged out by an administrator",
  reason: "admin_force_logout"
}
```

---

## Testing

### 1. Connect a user via socket
```javascript
// User connects with their token
socket.connect({ query: { token: 'Bearer user_jwt_token' } });
```

### 2. Admin triggers force logout
```bash
curl -X POST "http://localhost:3000/api/user/admin/force-logout/USER_ID" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Verify on frontend
- User should receive `forceLogout` event
- User should see the logout message
- User should be redirected to login screen
- All stored tokens should be cleared

---

## Checklist

- [ ] Add `forceLogout` event listener to socket service
- [ ] Implement `handleForceLogout` function
- [ ] Clear all stored authentication data (tokens, user info)
- [ ] Clear Redux/Context state if applicable
- [ ] Show notification/alert to user
- [ ] Navigate to login screen
- [ ] Disconnect socket connection
- [ ] Handle 401 errors globally (see below)
- [ ] Test with admin API endpoint

---

## Important: Handle 401 Errors Globally

After force logout, any API call with the old token will return `401 Unauthorized`. Your app should handle this globally.

### React Native - Axios Interceptor

```javascript
// src/services/apiService.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/RootNavigation';
import { CommonActions } from '@react-navigation/native';
import { store } from '../redux/store';
import { logout } from '../redux/slices/authSlice';

const api = axios.create({
  baseURL: 'https://your-api-url.com/api',
});

// Request interceptor - add token to headers
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors (token invalidated)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token is invalid (possibly force logged out)
      console.log('401 Unauthorized - Token invalidated');
      
      // Clear stored data
      await AsyncStorage.multiRemove([
        'accessToken',
        'refreshToken',
        'userId',
        'userData',
      ]);
      
      // Clear Redux state
      store.dispatch(logout());
      
      // Navigate to login
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Auth', params: { screen: 'Login' } }],
        })
      );
    }
    return Promise.reject(error);
  }
);

export default api;
```

### React Web - Axios Interceptor

```javascript
// src/services/api.js
import axios from 'axios';
import { toast } from 'react-toastify';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalidated - force logout occurred
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      
      toast.error('Your session has expired. Please login again.');
      
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Socket Connection Error Handling

```javascript
// When socket fails to connect due to invalid token
socket.on('connect_error', (error) => {
  if (error.message.includes('Token has been revoked') || 
      error.message.includes('Authentication error')) {
    // Token was invalidated by force logout
    handleForceLogout({ 
      message: 'Your session has expired. Please login again.' 
    });
  }
});
```

---

## Troubleshooting

### Event not received?
- Ensure socket is connected before admin triggers logout
- Check that user joined their userId room (happens automatically on `pairSuccess`)
- Verify socket URL and token are correct

### User not redirected?
- Check navigation setup (React Navigation / React Router)
- Ensure navigation ref is properly configured

### Tokens not cleared?
- Verify AsyncStorage/localStorage keys match what you're clearing
- Check for any other cached data that needs clearing

### User can still access app after force logout?
- Ensure you have the 401 interceptor set up (see above)
- Check that ALL API calls use the axios instance with the interceptor
- Verify socket reconnection also checks for auth errors

---

## Summary of Changes

### Backend Changes Made
1. Added `tokenVersion` field to User model (default: 0)
2. Updated `generateAccessToken()` to include `tokenVersion` in JWT payload
3. Updated `verifyToken` middleware to validate `tokenVersion` on every request
4. Updated `verifySocketToken` middleware to validate `tokenVersion` on socket connections
5. Updated `forceLogoutUser` to increment `tokenVersion` (invalidates all tokens)

### Frontend Changes Required
1. Listen for `forceLogout` socket event
2. Clear stored tokens and navigate to login when received
3. **Add 401 interceptor** to handle token invalidation on API calls
4. Handle socket `connect_error` for revoked tokens

### What Happens After Force Logout
1. All active socket connections are disconnected immediately
2. `tokenVersion` is incremented in the database
3. Any API call with old token returns `401 Unauthorized`
4. Any socket connection attempt with old token fails with "Token has been revoked"
5. User must login again to get a new valid token
