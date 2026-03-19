# TalkHub Onboarding & Auth API Guide

This document is the single source of truth for frontend developers integrating the TalkHub auth and onboarding flows. All base URLs are relative to the API root (e.g. `https://api.talkhub.app`).

---

## Table of Contents

1. [Flow Overview](#flow-overview)
2. [Flow A — Sign In (existing user)](#flow-a--sign-in-existing-user)
3. [Flow B — Sign Up with Invite Code](#flow-b--sign-up-with-invite-code)
4. [Flow C — Request Invitation (Waitlist)](#flow-c--request-invitation-waitlist)
5. [Post-Signup Onboarding Steps](#post-signup-onboarding-steps)
6. [Utility Endpoints](#utility-endpoints)
7. [Error Codes Reference](#error-codes-reference)
8. [Screen-to-API Mapping](#screen-to-api-mapping)

---

## Flow Overview

```
Landing Screen
├── "Sign In"  ──────────────────────────►  Flow A
└── "Sign Up (Received an Invitation?)"  ►  Invite-Only Screen
                                              ├── Enter invite code  ►  Flow B
                                              └── Request Invitation  ►  Flow C
```

---

## Flow A — Sign In (existing user)

No changes from the previous implementation. Use OTP-based login.

### Step 1 — Send OTP

```
POST /user/auth/login
```

**Request body** (choose one):
```json
{ "email": "emma@example.com" }
```
```json
{ "phoneNumber": "9876543210", "countryCode": "+91" }
```

**Success response:**
```json
{
  "identifierCode": "abc123uuid",
  "message": "OTP has been sent to your email address"
}
```

---

### Step 2 — Verify OTP

```
POST /user/auth/verify-otp
```

**Request body** (choose one):
```json
{
  "email": "emma@example.com",
  "identifierCode": "abc123uuid",
  "code": "123456",
  "fcmToken": "device-fcm-token-or-null"
}
```
```json
{
  "phoneNumber": "9876543210",
  "countryCode": "+91",
  "identifierCode": "abc123uuid",
  "code": "123456",
  "fcmToken": "device-fcm-token-or-null"
}
```

**Success response (verified user → logged in):**
```json
{
  "userId": "64abc...",
  "fullName": "Emma Deo",
  "userName": "@emma_deo",
  "profilePicture": "https://cdn.../photo.jpg",
  "fullLocation": "New York, USA",
  "email": "emma@example.com",
  "phoneNumber": null,
  "accessToken": "eyJhbGci...",
  "status": "verified",
  "accountRestored": false
}
```

Store `accessToken` — all subsequent authenticated requests must include:
```
Authorization: Bearer <accessToken>
```

---

### Resend OTP

```
POST /user/auth/resend-otp
```

**Request body** (same shape as login — email or phone):
```json
{ "email": "emma@example.com" }
```

**Response:**
```json
{
  "identifierCode": "new-uuid",
  "message": "OTP has been resent to your email address"
}
```

---

## Flow B — Sign Up with Invite Code

### Step 1 — Validate invite code (screen: "Got an invitation code?")

Before collecting email/phone, verify the code is valid and not expired.

```
POST /user/auth/validate-invite-code
```

**Request body:**
```json
{ "inviteCode": "6M8J1Z" }
```

**Success response:**
```json
{
  "valid": true,
  "message": "Invite code is valid",
  "inviteCode": "6M8J1Z"
}
```

**Error responses:**

| Error code | Meaning |
|------------|---------|
| ERR-143 | Invalid / non-existent invite code |
| ERR-145 | Invite code has expired |
| ERR-146 | Invite code has reached its maximum uses |

> Store the validated `inviteCode` locally — you will pass it in Step 2.

---

### Step 2 — Enter email/phone + send OTP

```
POST /user/auth/stage-one
```

**Request body** (choose one):
```json
{
  "email": "emma@example.com",
  "inviteCode": "6M8J1Z"
}
```
```json
{
  "phoneNumber": "9876543210",
  "countryCode": "+91",
  "inviteCode": "6M8J1Z"
}
```

> `inviteCode` is technically optional in the schema but **must be sent** for the invite-only signup UX.

**Success response:**
```json
{
  "identifierCode": "abc123uuid",
  "message": "OTP has been sent to your email address",
  "inviteCodeApplied": "6M8J1Z"
}
```

---

### Step 3 — Verify OTP

```
POST /user/auth/verify-otp
```

Same payload as Flow A Step 2.

**Success response (new user, not yet fully set up):**
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid-tracking-code",
  "status": "created"
}
```

> Save `userId` and `trackingCode` — these are required for Steps 4 and 5.

---

### Step 4 — Name + Username (screens: "What's your name?" → "Your username")

Collect name first, then username (with availability suggestions). Send both together.

```
POST /user/auth/stage-two
```

**Request body:**
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid-tracking-code",
  "fullName": "Emma Deo",
  "userName": "@emma_deo",
  "dateOfBirth": "1998-12-20"
}
```

> `dateOfBirth` is **optional** — the user can skip the DOB screen. Omit the field or send `null`.

**Success response:**
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid-tracking-code",
  "status": "infoAdded"
}
```

**Username availability check** (call before submitting stage-two):

```
GET /user/availableUserName?userName=@emma_deo
```

Response:
```json
{
  "suggestions": ["@emma_deo13", "@deoemma.2", "@deo2"],
  "isUsed": false
}
```

**Username suggestions from full name:**

```
GET /user/availableUserNameBasedOnFullName?fullName=Emma Deo
```

Response:
```json
{
  "suggestions": ["@emma_deo", "@emmadeo", "@deo_emma"]
}
```

---

### Step 5 — Profile Photo + Bio (skippable screens)

```
POST /user/auth/stage-three
```

**Request body:**
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid-tracking-code",
  "profilePicture": "https://cdn.../photo.jpg",
  "description": "I'm an artist based in New York."
}
```

> `profilePicture`, `description`, `fullLocation`, and `coordinates` are all **optional**. Send only what the user filled in. Skip fields the user left blank.

**Upload a profile photo first** (before calling stage-three):

```
POST /user/upload
Content-Type: multipart/form-data

image: <file>
```

Response:
```json
{
  "file": "https://cdn.../photo.jpg",
  "mediaType": "image"
}
```

**Success response (user is now fully signed up):**
```json
{
  "userId": "64abc...",
  "status": "verified",
  "accessToken": "eyJhbGci...",
  "fullName": "Emma Deo",
  "userName": "@emma_deo",
  "profilePicture": "https://cdn.../photo.jpg",
  "fullLocation": null,
  "email": "emma@example.com",
  "phoneNumber": null,
  "countryCode": null,
  "referralCode": "AB12CD"
}
```

> **`accessToken`** — store this for all subsequent authenticated calls.
> **`referralCode`** — automatically generated. Show it on the "Invite Friends" screen.

---

## Flow C — Request Invitation (Waitlist)

### Step 1 — Submit request (screen: "Request an Invitation")

```
POST /user/auth/request-invitation
```

**Request body** (email variant):
```json
{
  "fullName": "Emma d'souza",
  "email": "emma.20@gmail.com",
  "fullLocation": "Plot# 11, Utter Pradesh, 201301, India",
  "coordinates": [28.5355, 77.3910],
  "dateOfBirth": "1998-12-20",
  "referredBy": "John Doe",
  "reason": "Bronx Based, MD ANT. Art, photography, literature..."
}
```

**Request body** (phone variant):
```json
{
  "fullName": "Emma d'souza",
  "phoneNumber": "9876543210",
  "countryCode": "+91",
  "fullLocation": "Plot# 11, Utter Pradesh, 201301, India",
  "dateOfBirth": "1998-12-20",
  "referredBy": "John Doe",
  "reason": "Bronx Based, MD ANT. Art, photography..."
}
```

> Optional fields: `fullLocation`, `coordinates`, `dateOfBirth`, `referredBy`, `reason`.

**Success response:**
```json
{
  "success": true,
  "requestId": "64waitlist...",
  "status": "pending",
  "message": "You're on the waitlist! We'll review your request and reach out when your invitation is ready."
}
```

**Already submitted response** (duplicate email/phone):
```json
{
  "alreadyRequested": true,
  "requestId": "64waitlist...",
  "status": "pending",
  "message": "You have already submitted an invitation request."
}
```

> Show the "You're on the waitlist!" confirmation modal. Save `requestId` to use for username reservation.

---

### Step 2 — Reserve username (screen: "Reserve your username", optional)

Shown after tapping "Reserve a Username" in the confirmation modal.

```
POST /user/auth/reserve-username
```

**Request body:**
```json
{
  "requestId": "64waitlist...",
  "username": "emma_deo"
}
```

> You can send the username with or without the `@` prefix — the API normalises it.

**Success response:**
```json
{
  "success": true,
  "reserved": true,
  "username": "@emma_deo",
  "message": "Username reserved successfully."
}
```

**Username taken (HTTP 409):**
```json
{
  "available": false,
  "message": "Username is already taken. Please choose another."
}
```

**Username reserved by another waitlist user (HTTP 409):**
```json
{
  "available": false,
  "message": "Username is already reserved. Please choose another."
}
```

---

## Post-Signup Onboarding Steps

These calls require **`Authorization: Bearer <accessToken>`**.

All steps use the same endpoint:

```
PUT /user/onboarding
```

### Step: interests (screen: "Choose Interests")

```json
{
  "step": "interests",
  "interestSubCategories": ["64sub1...", "64sub2...", "64sub3..."]
}
```

Get available interests first:

```
GET /interest/categories
GET /interest/categories/:categoryId/subcategories
```

**Response:**
```json
{
  "step": "interests",
  "user": {
    "_id": "64abc...",
    "interestSubCategories": ["64sub1...", "64sub2..."],
    "interestCategories": []
  }
}
```

> Minimum 1 sub-category required (UI should enforce minimum 5 selections per the design).

---

### Step: communityRules (screen: "TalkHub Rules")

Called when the user taps "Continue" after checking "I accept the Rules".

```json
{
  "step": "communityRules"
}
```

**Response:**
```json
{
  "step": "communityRules",
  "user": {
    "_id": "64abc...",
    "rulesAcceptedAt": "2026-03-14T12:00:00.000Z"
  }
}
```

---

### Step: describe (optional, screen: "Tell Us About Yourself")

```json
{
  "step": "describe",
  "description": "I'm an authentic, adaptive AI collaborator..."
}
```

---

### Step: details (optional, for profile completeness)

```json
{
  "step": "details",
  "language": "English",
  "occupation": "Software Engineer",
  "school": "MIT",
  "religion": "None"
}
```

---

## Utility Endpoints

### Get referral code (Invite Friends screen)

After signup, the user's referral code is auto-generated and returned in the Stage 3 response. You can also fetch it at any time:

```
GET /settings/referral-code
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "referralCode": "AB12CD",
  "hasReferralCode": true,
  "isActive": true,
  "currentUses": 3
}
```

---

### Get contacts / Invite Friends

The contacts screen shows which contacts are already on TalkHub. Use the suggest users endpoint:

```
GET /user/suggested
Authorization: Bearer <accessToken>
```

---

### Resend OTP (during signup)

```
POST /user/auth/resend-otp
```

**Request body:**
```json
{ "email": "emma@example.com" }
```

---

### Stage Four — Optional secondary contact

After Stage 3, optionally collect a secondary contact method (phone if signed up with email, or email if signed up with phone).

**Check what to ask:**
```
GET /user/auth/stage-four?userId=64abc...&trackingCode=uuid
```

**Send OTP to secondary contact:**
```
POST /user/auth/stage-four
```
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid",
  "email": "secondary@example.com"
}
```

**Verify secondary contact OTP:**
```
POST /user/auth/stage-four/verify-otp
```
```json
{
  "userId": "64abc...",
  "trackingCode": "uuid",
  "identifierCode": "otp-session-id",
  "code": "123456",
  "email": "secondary@example.com"
}
```

---

## Error Codes Reference

| Code | Meaning | When it occurs |
|------|---------|----------------|
| ERR-001 | Missing required data | email or phone not provided |
| ERR-003 | Invalid token | JWT expired or invalid |
| ERR-101 | Account already exists / already verified | Calling stage-one or stage-two with a verified account |
| ERR-102 | Please sign up again / update failed | Tracking code mismatch, or DB update failed |
| ERR-103 | Max resend OTP attempts reached | Too many resend requests |
| ERR-104 | Invalid OTP | Wrong or expired OTP code |
| ERR-109 | User not found | userId doesn't exist |
| ERR-112 | Please complete the signup process | Trying to log in before finishing signup |
| ERR-113 | Couldn't sign up user | OAuth failure |
| ERR-137 | Invalid interest subcategory | Subcategory ID not found or inactive |
| ERR-141 | Current password is incorrect | Wrong password in update-password |
| ERR-142 | Password update failed | DB error during password update |
| ERR-143 | Invalid invite code | Code doesn't exist |
| ERR-144 | Cannot use own referral code | User tried to use their own code |
| ERR-145 | Invite code has expired | Code expiry date passed |
| ERR-146 | Invite code max uses reached | Code has been used the maximum number of times |
| ERR-147 | No referral code exists | Trying to update settings without generating a code first |

---

## Screen-to-API Mapping

| Screen | Method | Endpoint | Auth |
|--------|--------|----------|------|
| Landing — Sign In tap | — | Navigate to login | — |
| Landing — Sign Up tap | — | Navigate to invite screen | — |
| **Invite Screen** | | | |
| Enter invite code → Continue | `POST` | `/user/auth/validate-invite-code` | None |
| Request Invitation button | — | Navigate to waitlist form | — |
| **Sign-up Flow (after code validated)** | | | |
| Enter email/phone | `POST` | `/user/auth/stage-one` | None |
| Enter OTP | `POST` | `/user/auth/verify-otp` | None |
| Resend OTP | `POST` | `/user/auth/resend-otp` | None |
| What's your name? | — | (collect locally) | — |
| Your username — check availability | `GET` | `/user/availableUserName?userName=@...` | None |
| Your username — get suggestions | `GET` | `/user/availableUserNameBasedOnFullName?fullName=...` | None |
| Name + Username → Next | `POST` | `/user/auth/stage-two` | None |
| What's your age? (skippable) | — | (included in stage-two payload) | — |
| Add a Profile Photo — upload | `POST` | `/user/upload` | None |
| Add a Profile Photo + Bio → Next | `POST` | `/user/auth/stage-three` | None |
| Tell Us About Yourself | `PUT` | `/user/onboarding` (`step: describe`) | Bearer |
| Choose Interests | `PUT` | `/user/onboarding` (`step: interests`) | Bearer |
| Get interest categories | `GET` | `/interest/categories` | Bearer |
| Invite Friends — get referral code | `GET` | `/settings/referral-code` | Bearer |
| Invite Friends — get contacts | `GET` | `/user/suggested` | Bearer |
| TalkHub Rules → Continue | `PUT` | `/user/onboarding` (`step: communityRules`) | Bearer |
| **Waitlist Flow** | | | |
| Submit invitation request | `POST` | `/user/auth/request-invitation` | None |
| Reserve a Username | `POST` | `/user/auth/reserve-username` | None |
| **Sign-in Flow** | | | |
| Enter email/phone | `POST` | `/user/auth/login` | None |
| Enter OTP | `POST` | `/user/auth/verify-otp` | None |
| Resend OTP | `POST` | `/user/auth/resend-otp` | None |

---

## Notes for Frontend Developers

1. **`trackingCode`** — Returned by `verify-otp` (during signup) and needed for `stage-two` and `stage-three`. Store it in memory; never persist to disk.

2. **`accessToken`** — Returned by `stage-three` (signup complete) and `verify-otp` (login). Store securely (e.g. Keychain on iOS, EncryptedSharedPreferences on Android). Include in every protected request as `Authorization: Bearer <token>`.

3. **`referralCode`** — Automatically generated when signup completes (Stage 3 response). No extra call needed. Also available via `GET /settings/referral-code`.

4. **Skippable screens** — DOB, profile photo, bio and location are all optional. Simply omit the fields from the request body or pass `null`.

5. **Username format** — Always prefix with `@` (e.g. `@emma_deo`). The API stores and returns usernames with the `@` prefix.

6. **OTP code length** — Always 6 numeric digits.

7. **Invite code length** — Always 6 alphanumeric characters (A-Z, 0-9), uppercase.

8. **Waitlist status values** — `pending` | `approved` | `rejected`. Poll or use push notifications to tell users when they have been approved.
