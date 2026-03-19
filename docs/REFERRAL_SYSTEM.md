# Referral System API Documentation

This document provides frontend developers with everything needed to integrate the referral code feature.

---

## Overview

The referral system allows users to:
1. **Generate** a unique 6-character referral code
2. **Share** their code with friends
3. **Apply** a friend's referral code to their own account
4. **View** a list of users they've referred

---

## API Endpoints

### Base URL
```
/settings
```

All endpoints require authentication via JWT token in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## 1. Generate Referral Code

Generate a unique 6-character referral code for the authenticated user. If the user already has a code, returns the existing one.

### Request
```http
POST /settings/generate-referral-code
Content-Type: application/json
Authorization: Bearer <token>

{
  "userId": "optional - defaults to authenticated user"
}
```

### Response (Success - 200)
```json
{
  "data": {
    "message": "Referral code generated successfully",
    "userId": "507f1f77bcf86cd799439011",
    "referralCode": "A3B9K2",
    "fullName": "John Doe",
    "userName": "@johndoe",
    "profilePicture": "https://example.com/photo.jpg"
  }
}
```

### Response (Already Exists - 200)
```json
{
  "data": {
    "message": "Referral code already exists",
    "userId": "507f1f77bcf86cd799439011",
    "referralCode": "A3B9K2",
    "fullName": "John Doe",
    "userName": "@johndoe",
    "profilePicture": "https://example.com/photo.jpg"
  }
}
```

### Referral Code Format
- **Length**: Exactly 6 characters
- **Characters**: 0-9 and A-Z only (uppercase)
- **Example**: `A3B9K2`, `7XY4M1`, `QZ8P2N`

---

## 2. Get Referral Code

Get the current user's referral code without generating a new one.

### Request
```http
GET /settings/referral-code
Authorization: Bearer <token>
```

### Response (Success - 200)
```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "referralCode": "A3B9K2",
    "fullName": "John Doe",
    "userName": "@johndoe",
    "profilePicture": "https://example.com/photo.jpg",
    "hasReferralCode": true
  }
}
```

### Response (No Code Yet - 200)
```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "referralCode": null,
    "fullName": "John Doe",
    "userName": "@johndoe",
    "profilePicture": "https://example.com/photo.jpg",
    "hasReferralCode": false
  }
}
```

---

## 3. Apply Invite Code

Apply a referral code from another user to a user's account.

> **Important**: 
> - This endpoint does **NOT require authentication** - can be used during signup
> - Once an invite code is applied, it cannot be changed

### Request
```http
POST /settings/apply-invite-code
Content-Type: application/json

{
  "userId": "507f1f77bcf86cd799439012",
  "inviteCode": "A3B9K2"
}
```

### Request Body Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | The user ID to apply the invite code to |
| inviteCode | string | Yes | The 6-character referral code to apply |

### Response (Success - 200)
```json
{
  "data": {
    "message": "Invite code applied successfully",
    "userId": "507f1f77bcf86cd799439012",
    "inviteCode": "A3B9K2",
    "referredBy": {
      "userId": "507f1f77bcf86cd799439011",
      "fullName": "Jane Smith",
      "userName": "@janesmith"
    }
  }
}
```

### Response (Already Applied - 200)
```json
{
  "data": {
    "message": "Invite code already applied",
    "inviteCode": "A3B9K2",
    "alreadyApplied": true
  }
}
```

### Error Responses

| Error Code | HTTP Status | Message |
|------------|-------------|---------|
| ERR-109 | 400 | User not found |
| ERR-143 | 400 | Invalid invite code. This referral code does not exist. |
| ERR-144 | 400 | You cannot use your own referral code. |

---

## 4. Get Referred Users

Get a paginated list of users who signed up using the current user's referral code.

### Request
```http
GET /settings/referred-users?pageNum=1&pageSize=20
Authorization: Bearer <token>
```

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| pageNum | number | 1 | Page number (starts from 1) |
| pageSize | number | 20 | Number of results per page (max: 100) |

### Response (Success - 200)
```json
{
  "data": {
    "metadata": {
      "totalDocuments": 15,
      "pageNum": 1,
      "pageSize": 20,
      "totalPages": 1
    },
    "referralCode": "A3B9K2",
    "referredUsers": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "fullName": "Alice Johnson",
        "userName": "@alicejohnson",
        "profilePicture": "https://example.com/alice.jpg",
        "createdAt": "2025-01-08T10:30:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "fullName": "Bob Williams",
        "userName": "@bobwilliams",
        "profilePicture": "https://example.com/bob.jpg",
        "createdAt": "2025-01-07T15:45:00.000Z"
      }
    ]
  }
}
```

### Response (No Referral Code - 200)
```json
{
  "data": {
    "metadata": {
      "totalDocuments": 0,
      "pageNum": 1,
      "pageSize": 20,
      "totalPages": 0
    },
    "referralCode": null,
    "referredUsers": []
  }
}
```

---

## User Model Fields

Two new fields have been added to the user document:

| Field | Type | Description |
|-------|------|-------------|
| `referralCode` | String | User's unique 6-char referral code (generated on demand) |
| `inviteCode` | String | The referral code this user used during signup |

---

## Integration Flow

### Scenario 1: User Generates & Shares Their Code

```
1. User opens "Invite Friends" screen
2. Frontend calls: GET /settings/referral-code
3. If hasReferralCode is false:
   - Show "Generate Code" button
   - On tap: POST /settings/generate-referral-code
4. Display referral code with share options
5. User shares code via SMS, WhatsApp, etc.
```

### Scenario 2: New User Applies an Invite Code

```
1. During onboarding or in settings, show "Have a referral code?" input
2. User enters 6-character code
3. Frontend calls: POST /settings/apply-invite-code with { userId, inviteCode }
   (No auth token needed - works during signup flow)
4. On success: Show who referred them
5. On error (ERR-143): Show "Invalid code" message
```

### Scenario 3: User Views Their Referrals

```
1. User opens "My Referrals" screen
2. Frontend calls: GET /settings/referred-users?pageNum=1&pageSize=20
3. Display list with pagination
4. Show referralCode at the top for easy sharing
```

---

## Example: React/React Native Integration

```javascript
// Generate referral code
const generateReferralCode = async () => {
  const response = await fetch('/settings/generate-referral-code', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  
  const { data } = await response.json();
  console.log('Referral Code:', data.referralCode);
  return data;
};

// Apply invite code (no auth required - can be used during signup)
const applyInviteCode = async (userId, inviteCode) => {
  const response = await fetch('/settings/apply-invite-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, inviteCode }),
  });
  
  const result = await response.json();
  
  if (result.code === 'ERR-109') {
    alert('User not found');
    return null;
  }
  
  if (result.code === 'ERR-143') {
    alert('Invalid referral code');
    return null;
  }
  
  if (result.code === 'ERR-144') {
    alert('You cannot use your own code');
    return null;
  }
  
  return result.data;
};

// Get referred users
const getReferredUsers = async (pageNum = 1, pageSize = 20) => {
  const response = await fetch(
    `/settings/referred-users?pageNum=${pageNum}&pageSize=${pageSize}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  
  const { data } = await response.json();
  return data;
};
```

---

## Share Text Template

When sharing referral codes, use this template:

```
Hey! Join me on TalkHub! 🎉

Use my referral code: {REFERRAL_CODE}

Download the app: [App Store / Play Store Link]
```

---

## Error Codes Summary

| Code | HTTP | Description |
|------|------|-------------|
| ERR-003 | 401 | Invalid/expired token - user needs to re-authenticate |
| ERR-005 | 403 | Unauthorized - user tried to generate code for someone else |
| ERR-109 | 400 | User not found |
| ERR-143 | 400 | Invalid invite code |
| ERR-144 | 400 | Cannot use own referral code |

## Authentication Requirements

| Endpoint | Auth Required |
|----------|---------------|
| POST /settings/generate-referral-code | ✅ Yes |
| GET /settings/referral-code | ✅ Yes |
| POST /settings/apply-invite-code | ❌ No |
| GET /settings/referred-users | ✅ Yes |

---

## Notes

1. **Referral codes are permanent** - once generated, they cannot be changed
2. **Invite codes can only be applied once** - users cannot change their referrer
3. **Codes are case-insensitive** - "a3b9k2" will be converted to "A3B9K2"
4. **Codes are unique** - no two users can have the same referral code

