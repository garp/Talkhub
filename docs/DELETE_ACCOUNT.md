# Account Deletion API Documentation

This document describes the temporary account deletion flow for the Chit-Chat application.

## Overview

The application supports **temporary account deletion**. When a user temporarily deletes their account, they can restore it by simply logging in again.

## Data Model

The `deleteInfo` object is added to the User model:

```javascript
deleteInfo: {
  status: {
    type: String,
    enum: ['none', 'temporary'],
    default: 'none',
  },
  reason: {
    type: String,
    trim: true,
    default: null,
  },
  requestedAt: {
    type: Date,
    default: null,
  },
  restoredAt: {
    type: Date,
    default: null,
  },
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `status` | Current deletion status: `none` or `temporary` |
| `reason` | Optional reason provided by user for account deletion |
| `requestedAt` | Timestamp when deletion was requested |
| `restoredAt` | Timestamp when account was restored |

---

## API Endpoint

### Temporary Delete Account

Marks the account for temporary deletion. User can restore it by logging in again.

**Endpoint:** `DELETE /user/:userId/delete-account/temp`

**Authentication:** Required (Bearer Token)

**Request Parameters:**

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `userId` | string | URL Params | Yes | The user's ID (must match authenticated user) |
| `reason` | string | Body | No | Reason for deleting the account (max 500 chars) |

**Request Example:**

```bash
curl -X DELETE "http://localhost:3000/user/507f1f77bcf86cd799439011/delete-account/temp" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Taking a break from social media"}'
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "message": "Account temporarily deleted. Login again to restore your account.",
    "deleteInfo": {
      "status": "temporary",
      "reason": "Taking a break from social media",
      "requestedAt": "2025-12-29T10:30:00.000Z",
      "restoredAt": null
    }
  }
}
```

**Error Responses:**

| Code | Error | Description |
|------|-------|-------------|
| 400 | ERR-138 | Account is already marked for deletion |
| 400 | ERR-109 | User not found |
| 403 | ERR-005 | Unauthorized (userId mismatch) |
| 400 | ERR-140 | Cannot delete account |

---

## Account Restoration Flow

When a user with a temporarily deleted account logs in through any of the following methods, their account is automatically restored:

1. **OTP Verification** (`POST /user/auth/verify-otp`)
2. **Google Auth** (`POST /user/auth/google`)
3. **Continue Auth** (`POST /user/auth/continue`)

The restoration process:
1. Sets `deleteInfo.status` back to `none`
2. Sets `deleteInfo.restoredAt` to current timestamp
3. Sets `active` to `true`

**Response includes `accountRestored: true`** when an account is restored during login.

---

## Flow Diagram

### Temporary Delete & Restore Flow

```
┌─────────────────┐
│  User requests  │
│ temporary delete│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Set deleteInfo  │
│ status: temp    │
│ active: false   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  User tries to  │────▶│ Account restored│
│     login       │     │ status: none    │
└─────────────────┘     │ active: true    │
                        │ restoredAt: now │
                        └─────────────────┘
```

---

## Integration Guide

### Frontend Implementation

#### 1. Delete Account Screen

Show a "Take a break" or "Deactivate account" option to the user.

#### 2. Confirmation Dialog

Before deleting, show a confirmation dialog:
```
Are you sure you want to deactivate your account?
- Your profile will be hidden from other users
- You can restore your account anytime by logging in again
```

#### 3. Handle Login Response

Check for `accountRestored` field in login responses:

```javascript
const response = await login(credentials);
if (response.accountRestored) {
  showToast("Welcome back! Your account has been restored.");
}
```

---

## Error Codes Reference

| Code | HTTP Status | Message |
|------|-------------|---------|
| ERR-138 | 400 | Account is already marked for deletion |
| ERR-140 | 400 | Cannot delete account. Please try again later. |

---

## Security Considerations

- Users can only delete their own accounts (userId in params must match authenticated user)
- All delete operations require authentication
- Account restoration happens automatically on next login
