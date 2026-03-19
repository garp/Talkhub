# Auth API — cURL examples for frontend

Base URL: `http://localhost:3800` (or your server). All auth endpoints are under **`/user`**.

**Success responses** are wrapped in `{ "data": { ... } }`.  
**Error responses** are `{ "code": "ERR-xxx", "message": "..." }` with appropriate HTTP status.

---

## 1. Stage-one — Identify (email or phone) & send OTP

**POST** `/user/auth/stage-one`

### Option A: Email

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-one' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "inviteCode": "ABCD1234"
  }'
```

`inviteCode` is optional. Omit or send `null`/`""` to skip.

**Example success response (200):**

```json
{
  "data": {
    "identifierCode": "550e8400-e29b-41d4-a716-446655440000",
    "message": "OTP has been sent to your email address",
    "inviteCodeApplied": "ABCD1234"
  }
}
```

### Option B: Phone

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-one' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "9876543210",
    "countryCode": "+91",
    "inviteCode": "ABCD1234"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "identifierCode": "550e8400-e29b-41d4-a716-446655440000",
    "message": "OTP has been sent to your mobile number",
    "inviteCodeApplied": "ABCD1234"
  }
}
```

**Example error (400):** `{ "code": "ERR-101", "message": "Already exists" }` — user already verified.

---

## 2. Verify OTP (auth)

**POST** `/user/auth/verify-otp`

### Option A: Email OTP

```bash
curl -X POST 'http://localhost:3800/user/auth/verify-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "identifierCode": "550e8400-e29b-41d4-a716-446655440000",
    "code": "123456",
    "fcmToken": "device-fcm-token-optional"
  }'
```

### Option B: Phone OTP

```bash
curl -X POST 'http://localhost:3800/user/auth/verify-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "9876543210",
    "countryCode": "+91",
    "identifierCode": "550e8400-e29b-41d4-a716-446655440000",
    "code": "123456",
    "fcmToken": "device-fcm-token-optional"
  }'
```

**Example success — user not yet fully signed up (needs stage-two, etc.) (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "created"
  }
}
```

**Example success — user already verified (login) (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "fullName": "John Doe",
    "userName": "johndoe",
    "profilePicture": "https://...",
    "fullLocation": "New York, USA",
    "email": "user@example.com",
    "phoneNumber": "9876543210",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "status": "verified",
    "accountRestored": false
  }
}
```

**Example error (400):** `{ "code": "ERR-104", "message": "Invalid OTP" }`

---

## 3. Stage-two — Profile basics (fullName, DOB, userName)

**POST** `/user/auth/stage-two`

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-two' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fullName": "John Doe",
    "dateOfBirth": "1990-05-15",
    "userName": "johndoe"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "infoAdded"
  }
}
```

**Example error (400):** `{ "code": "ERR-112", "message": "Please complete the signup process" }`

---

## 4. GET Stage-four — What to ask (email or phone missing)

**GET** `/user/auth/stage-four?userId=...&trackingCode=...`

Call this to know whether to show the “add email” or “add phone” step (or skip).

```bash
curl -X GET 'http://localhost:3800/user/auth/stage-four?userId=507f1f77bcf86cd799439011&trackingCode=a1b2c3d4-e5f6-7890-abcd-ef1234567890'
```

**Example — ask for email (user signed up with phone) (200):**

```json
{
  "data": {
    "askFor": "email",
    "needsEmail": true,
    "needsPhone": false,
    "complete": false,
    "message": "Ask for email (phone is already present)"
  }
}
```

**Example — ask for phone (user signed up with email) (200):**

```json
{
  "data": {
    "askFor": "phone",
    "needsEmail": false,
    "needsPhone": true,
    "complete": false,
    "message": "Ask for phone number (email is already present)"
  }
}
```

**Example — both present, nothing to ask (200):**

```json
{
  "data": {
    "askFor": null,
    "needsEmail": false,
    "needsPhone": false,
    "complete": true,
    "message": "Both email and phone are present; nothing to ask"
  }
}
```

---

## 5. POST Stage-four — Add secondary contact or skip

**POST** `/user/auth/stage-four`

### Option A: Skip (no email/phone in body)

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-four' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "skipped": true,
    "message": "Secondary contact step skipped"
  }
}
```

### Option B: Add email (user signed up with phone)

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-four' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "user@example.com"
  }'
```

### Option C: Add phone (user signed up with email)

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-four' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "phoneNumber": "9876543210",
    "countryCode": "+91"
  }'
```

**Example success when OTP is sent (200):**

```json
{
  "data": {
    "identifierCode": "660e8400-e29b-41d4-a716-446655440001",
    "message": "OTP has been sent to your email address"
  }
}
```

Use `identifierCode` and the OTP `code` in **stage-four verify-otp** next.

---

## 6. Stage-four — Verify OTP (secondary contact)

**POST** `/user/auth/stage-four/verify-otp`

### Option A: Email OTP

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-four/verify-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifierCode": "660e8400-e29b-41d4-a716-446655440001",
    "code": "123456",
    "email": "user@example.com"
  }'
```

### Option B: Phone OTP

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-four/verify-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifierCode": "660e8400-e29b-41d4-a716-446655440001",
    "code": "123456",
    "phoneNumber": "9876543210",
    "countryCode": "+91"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "user@example.com",
    "message": "Secondary contact verified successfully"
  }
}
```

(For phone, response will include `phoneNumber` and `countryCode` instead of `email`.)

**Example error (400):** `{ "code": "ERR-104", "message": "Invalid OTP" }`

---

## 7. Stage-three — Location & profile → verified + accessToken

**POST** `/user/auth/stage-three`

```bash
curl -X POST 'http://localhost:3800/user/auth/stage-three' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "trackingCode": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fullLocation": "New York, USA",
    "coordinates": [-73.935242, 40.730610],
    "profilePicture": "https://...",
    "description": "Hello world"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "status": "verified",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "fullName": "John Doe",
    "userName": "johndoe",
    "profilePicture": "https://...",
    "fullLocation": "New York, USA",
    "email": "johndoe"
  }
}
```

Use `accessToken` as `Authorization: Bearer <accessToken>` for protected endpoints.

---

## 8. Login (send OTP for existing verified user)

**POST** `/user/auth/login`

### Option A: Email

```bash
curl -X POST 'http://localhost:3800/user/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com"
  }'
```

### Option B: Phone

```bash
curl -X POST 'http://localhost:3800/user/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "9876543210",
    "countryCode": "+91"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "identifierCode": "770e8400-e29b-41d4-a716-446655440002",
    "message": "OTP has been sent to your email address"
  }
}
```

Then use **verify-otp** (same as step 2) with this `identifierCode` and the OTP `code`; response will include `accessToken` for verified users.

---

## 9. Resend OTP (auth)

**POST** `/user/auth/resend-otp`

```bash
curl -X POST 'http://localhost:3800/user/auth/resend-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com"
  }'
```

Or with phone:

```bash
curl -X POST 'http://localhost:3800/user/auth/resend-otp' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "9876543210",
    "countryCode": "+91"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "identifierCode": "880e8400-e29b-41d4-a716-446655440003",
    "message": "OTP has been resent to your email address"
  }
}
```

**Example error (400):** `{ "code": "ERR-103", "message": "You have reached the maximum number of resend attempts" }`

---

## 10. Continue auth (email — get accessToken if already verified)

**POST** `/user/auth/continue`

```bash
curl -X POST 'http://localhost:3800/user/auth/continue' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com"
  }'
```

**Example success response (200):**

```json
{
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "fullName": "John Doe",
    "userName": "johndoe",
    "profilePicture": "https://...",
    "email": "user@example.com"
  }
}
```

---

## Common error codes (auth)

| Code     | HTTP | Message |
|----------|------|---------|
| ERR-001  | 400  | Missing data in request |
| ERR-101  | 400  | Already exists |
| ERR-102  | 400  | Please sign-up again |
| ERR-103  | 400  | You have reached the maximum number of resend attempts |
| ERR-104  | 400  | Invalid OTP |
| ERR-109  | 400  | User not found |
| ERR-112  | 400  | Please complete the signup process |
| ERR-143  | 400  | Invalid invite code |
| ERR-145  | 400  | Referral code has expired |
| ERR-146  | 400  | Referral code reached max uses |

Validation errors (e.g. invalid body) may return `400` with a string `message` in the response body.

---

## Suggested signup flow (frontend)

1. **Stage-one** (email or phone) → get `identifierCode`.
2. User enters OTP → **Verify OTP** → get `userId`, `trackingCode`, `status`.
3. **Stage-two** (fullName, dateOfBirth, userName) → get updated `trackingCode`, `status: "infoAdded"`.
4. **GET stage-four** → get `askFor` / `needsEmail` / `needsPhone` / `complete`.
5. If not `complete`: show “Add email” or “Add phone” (or skip).
   - **POST stage-four** (with email or phone to add) → get `identifierCode` → user enters OTP → **stage-four/verify-otp**.
   - Or **POST stage-four** with only `userId` + `trackingCode` to skip.
6. **Stage-three** (location, profile) → get `accessToken`, `status: "verified"`.
7. Use `accessToken` in `Authorization: Bearer <accessToken>` for all protected APIs.
