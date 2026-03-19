# Onboarding Progress API — Frontend Guide

This document describes the **onboarding progress** APIs. A separate collection stores boolean flags for each step so the frontend can resume where the user left off.

**Base path:** All endpoints are under the user API root (e.g. `https://backend-dev.talkhub.co/user`).

**Auth:** All endpoints require `Authorization: Bearer <accessToken>`.

---

## Progress keys (boolean)

| Key | Description |
|-----|-------------|
| `nameAdded` | User has added full name |
| `userNameAdded` | User has added username |
| `dobAdded` | User has added date of birth |
| `profilePhotoAdded` | User has added profile photo |
| `descriptionAdded` | User has added bio/description |
| `interestsAdded` | User has added interests |
| `rulesAccepted` | User has accepted community rules |

**Rules:**
- `nameAdded` and `userNameAdded` can only be set to `true`. They cannot be set to `false` (validation will reject).
- All other keys can be `true` or `false`. Use `false` when the user **skips** that step.

---

## Endpoints

### 1. Create onboarding record (optional)

**POST** `/user/onboarding`

Creates an onboarding progress document for the logged-in user. All keys start as `false`. If a record already exists, returns the existing one.

**Headers:** `Authorization: Bearer <accessToken>`

**Request body:** None (or empty `{}`).

**Response (201 or 200):**
```json
{
  "data": {
    "userId": "69b7b3abd70063ab3b605be8",
    "nameAdded": false,
    "userNameAdded": false,
    "dobAdded": false,
    "profilePhotoAdded": false,
    "descriptionAdded": false,
    "interestsAdded": false,
    "rulesAccepted": false
  }
}
```

---

### 2. Get onboarding progress

**GET** `/user/onboarding/:userId`

Returns the onboarding progress for the given user. The token must belong to that user (users can only read their own progress). If no record exists, returns the same shape with all values `false`.

**Headers:** `Authorization: Bearer <accessToken>`

**Params:** `userId` — the user’s ID (must match the logged-in user).

**Response (200):**
```json
{
  "data": {
    "userId": "69b7b3abd70063ab3b605be8",
    "nameAdded": true,
    "userNameAdded": true,
    "dobAdded": false,
    "profilePhotoAdded": true,
    "descriptionAdded": true,
    "interestsAdded": false,
    "rulesAccepted": false
  }
}
```

**Use:** On app load or when opening the onboarding flow, call this to know which screen to show (e.g. next step or “resume” at the last incomplete step).

---

### 3. Update onboarding progress

**PUT** `/user/onboarding/:userId`

Updates one or more progress keys. Only the owner of `userId` can update (token must match). If no document exists, it is created with the sent keys and defaults for the rest.

**Headers:** `Authorization: Bearer <accessToken>`

**Params:** `userId` — the user’s ID (must match the logged-in user).

**Request body (partial update):**
```json
{
  "nameAdded": true,
  "userNameAdded": true
}
```

When the user **completes** a step, send that key as `true`. When the user **skips**, send that key as `false` (except `nameAdded` and `userNameAdded`, which must never be `false`).

**Examples:**

- After name + username step:
```json
{
  "nameAdded": true,
  "userNameAdded": true
}
```

- User skips DOB:
```json
{
  "dobAdded": false
}
```

- User adds photo and description:
```json
{
  "profilePhotoAdded": true,
  "descriptionAdded": true
}
```

- User skips interests:
```json
{
  "interestsAdded": false
}
```

- User accepts rules:
```json
{
  "rulesAccepted": true
}
```

**Response (200):**
```json
{
  "data": {
    "userId": "69b7b3abd70063ab3b605be8",
    "nameAdded": true,
    "userNameAdded": true,
    "dobAdded": false,
    "profilePhotoAdded": true,
    "descriptionAdded": true,
    "interestsAdded": false,
    "rulesAccepted": true
  }
}
```

---

## Frontend flow summary

1. **Start:** After sign-up (e.g. after auth stage-three), optionally call **POST** `/user/onboarding` to create the progress record.
2. **Resume:** When opening onboarding, call **GET** `/user/onboarding/:userId` and use the returned flags to decide the first incomplete step (or show “resume” at the last step).
3. **After each step:** Call **PUT** `/user/onboarding/:userId` with the updated keys:
   - Set to `true` when the user completes the step.
   - Set to `false` when the user skips (except `nameAdded` and `userNameAdded`, which must stay `true`).

**Suggested order of steps:** nameAdded → userNameAdded → dobAdded → profilePhotoAdded → descriptionAdded → interestsAdded → rulesAccepted. You can still send updates in any order; the backend only persists the booleans.

---

## cURL examples

**Create:**
```bash
curl -X POST "https://backend-dev.talkhub.co/user/onboarding" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json"
```

**Get:**
```bash
curl -X GET "https://backend-dev.talkhub.co/user/onboarding/69b7b3abd70063ab3b605be8" \
  -H "Authorization: Bearer <accessToken>"
```

**Update (e.g. name + username done):**
```bash
curl -X PUT "https://backend-dev.talkhub.co/user/onboarding/69b7b3abd70063ab3b605be8" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"nameAdded":true,"userNameAdded":true}'
```

**Update (user skips DOB):**
```bash
curl -X PUT "https://backend-dev.talkhub.co/user/onboarding/69b7b3abd70063ab3b605be8" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"dobAdded":false}'
```

---

## Error codes

| Code   | Meaning |
|--------|--------|
| ERR-005 | Forbidden — userId in path does not match the logged-in user |
| ERR-102 | Update failed / resource not found |
