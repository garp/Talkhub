## TalkHub — Technical Documentation

> **Source of truth**: This documentation is derived from the backend repository code (Express routes, Mongoose models, Socket.IO events) plus existing `docs/*.md` files in this repo.
>
> **Assumptions (explicit)**:
> - Client apps exist for **mobile (iOS/Android)** and optionally **web** (multiple docs reference deep links + mobile flows).
> - “Hashtag chats” are community chats tied to `hashtags`; “Private chatrooms” are WhatsApp-like 1:1 or group DMs.
> - Public URLs (e.g., `https://backend.talkhub.co`) are **examples**; your actual base URL depends on deployment.

---

## 1) Product & System Overview

### What TalkHub is (backend perspective)
- **Social + chat platform**: users create posts (“chits”), join hashtag/community chats, message privately, post stories, and interact via follows/likes/reposts/comments.
- **Real-time first**: chat, presence, AI chat, and many UX updates flow through **Socket.IO**.
- **Location-aware**: users and hashtags have geolocation (`Point`), and there are “around me” feeds and place-based features.
- **AI features**: AI chat (streaming), AI voice chat (realtime audio), and AI image generation (upload to S3).

### Key differentiators (observed)
- **Hashtag chatrooms with roles** (admins/moderators; RBAC hooks exist)
- **WhatsApp-like private groups** (participants state: exit vs delete-for-me, clear chat, pin, mute)
- **End-to-end “growth” features**: referral codes + invite code application
- **Media pipeline**: S3 upload + CloudFront + async moderation (Rekognition) + reusable `mediaAssets`

---

## 2) Architecture (High-Level)

### Runtime components
- **HTTP API**: Express app (`src/app.js`) with REST endpoints mounted at `/`.
- **Real-time API**: Socket.IO server on the same HTTP server.
- **Database**: MongoDB via Mongoose.
- **Cache / presence**: Redis is present in code; connection is currently commented out in `src/index.js`.
- **Push**: Firebase Admin (FCM) for push notifications.
- **Media**: AWS S3 uploads + optional CloudFront CDN.
- **AI providers**: OpenAI (chat + realtime voice + image generation docs mention DALL·E) and Gemini (env vars present).

### Core data flows
- **Auth**: OTP email/phone + JWT access token; OAuth (Google/Facebook) supported via Passport.
- **Chat**:
  - Hashtag/community chat: `hashtags` → `chatrooms` → `messages`
  - Private chat: `privateChatrooms` → `privateMessages`
- **Feed**: REST feeds + socket `newFeed*` broadcasts.
- **Moderation**: media upload creates/links a `mediaAssets` doc; moderation is processed asynchronously (cron).

---

## 3) Tech Stack

### Backend
- **Node.js + Express** (`express`)
- **Socket.IO** (`socket.io`)
- **Validation**: Joi + `express-validator`
- **Auth**: JWT (`jsonwebtoken`), OTP (email/SMS), Passport OAuth (Google/Facebook)
- **Database**: MongoDB + Mongoose
- **Logging**: `morgan-body`, `winston`

### Infra/Integrations
- **AWS S3**: uploads (`multer-s3`, AWS SDK)
- **CloudFront**: optional CDN (`CLOUDFRONT_DOMAIN`, `CLOUDFRONT_ENABLED`)
- **AWS Rekognition**: media moderation
- **Firebase Admin**: push notifications via FCM
- **Twilio**: SMS OTP
- **FFmpeg**: installed in Docker (also used for voice/audio transcoding & thumbnails)

---

## 4) Environments & Configuration

### Node envs
- Uses `NODE_ENV` and loads `.env.<NODE_ENV>` (see `src/index.js`).
- Example scripts (see `package.json`):
  - `npm run dev` → `NODE_ENV=dev`
  - `npm run stage` → `NODE_ENV=stage`

### Ports
- `PORT` defaults to `3000`, but `.env.dev` uses `3800`.

### Key env vars (documented, not values)
- **Auth**: `ACCESS_TOKEN_SECRET`, `OTP_TIME_IN_SEC`, `SALT_ROUNDS`
- **OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- **Mongo**: `MONGO_URI`
- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **CORS**: `CORS_ORIGIN`
- **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Places**: `GOOGLE_PLACES_API_KEY`
- **Short links**: `SHORT_LINK_BASE_URL`
- **AWS**: S3 + Rekognition keys and region (various)

### Security note (important)
- The repo currently includes sensitive-looking values in `.env.dev` and `lib/configs/serviceAccountKey.json`.
- **Recommendation**: rotate any real keys, remove secrets from git history, and rely on environment injection (CI/CD secret store).

---

## 5) Authentication & Session Model

### JWT (Bearer)
- Most endpoints require `Authorization: Bearer <accessToken>`.
- JWT payload contains:
  - `userId`
  - `tokenVersion` (used to revoke tokens globally)

### Token revocation (force logout)
- On **force logout**, server increments `users.tokenVersion`.
- Middleware rejects any JWT whose `tokenVersion` doesn’t match the DB (`verifyToken` + `verifySocketToken`).
- See `docs/FORCE_LOGOUT_INTEGRATION.md`.

### OTP auth flow (email or phone)
User signup/login is a multi-step OTP + profile completion flow (see `src/routes/user.routes.js`, `src/controllers/user.controller.js`):
- **Stage 1**: `POST /user/auth/stage-one` (email or phone + optional invite code) → sends OTP
- **Verify OTP**: `POST /user/auth/verify-otp` → returns `trackingCode` or `accessToken` depending on user status
- **Stage 2**: `POST /user/auth/stage-two` → sets fullName, DOB, username
- **Stage 3**: `POST /user/auth/stage-three` → sets location/profile; returns `accessToken`
- **Login**: `POST /user/auth/login` → sends OTP for verified accounts
- **Resend OTP**: `POST /user/auth/resend-otp`
- **Continue auth**: `POST /user/auth/continue` (email) → returns accessToken if already verified

### OAuth
- Google/Facebook Passport flows:
  - `GET /user/auth/google` + callback
  - `GET /user/auth/facebook` + callback
- OAuth callback redirects to a mobile deep link scheme: `myapp://auth?...` (see `oauthSuccess`).
  - **Assumption**: the mobile app registers this scheme and extracts token/trackingCode.

---

## 6) Core Data Model (Important Entities)

> The fields below are abridged to “important” fields for engineering. Refer to `src/models/*.js` for full schemas.

### User (`users`)
- **Identity**: `email?`, `phoneNumber?`, `countryCode?` (at least one required)
- **Profile**: `fullName`, `userName`, `profilePicture`, `bannerPicture`, `description`
- **Location**: `location: { type: 'Point', coordinates: [lng, lat] }`, `fullLocation`
- **Status**: `status` = `created | infoAdded | verified`
- **Preferences**: `languages[]`, `interestCategories[]`, `interestSubCategories[]`, `notInterestedInterestCategories[]`
- **Social**: `followers`, `following`
- **Safety**: `blockedUsers[]`, `mutedUsers[]`, `mutedHashtags[]`
- **Push**: `fcmToken`
- **Security**: `tokenVersion`
- **Deletion**: `deleteInfo { status, reason, requestedAt, restoredAt }`
- **Referrals**: `referralCode`, `inviteCode`, `referralSettings`

### Hashtag (`hashtags`)
- **Core**: `name` (unique), `description`, `creatorId`
- **Scope/access**: `scope` (GLOBAL/LOCAL), `access` (PUBLIC/PRIVATE/BROADCAST)
- **Location**: `location` + `fullLocation`
- **Media**: `hashtagPhoto`, `hashtagBanner`, `hashtagPicture`
- **Hierarchy**: `parentHashtagId?`
- **Counters**: `likeCount`, `viewCount`

### Hashtag chatroom (`chatrooms`)
- **Link**: `hashtagId`, `parentChatroomId?`
- **Roles**: `admins[]`, `moderators[]`
- **Exit audit**: `exParticipants[]`

### Message (hashtag chat) (`messages`)
- **Link**: `chatroomId`, `senderId`
- **Types**: `text|image|video|audio|location|file|poll`
- **Poll**: question/options, expiry, quiz mode
- **Moderation**: `mediaAssetId` + `mediaModeration` (status/reasons)
- **Reactions**: `reactions[]`
- **Delivery**: `status`, `readBy[]`, `deliveredTo[]`
- **Deletion**:
  - “delete for everyone”: `isDeleted`, `deletedBy`, `deletedAt` (tombstone enforced)
  - “delete for me”: `deletedFor[]`

### Private chatroom (`privateChatrooms`)
- **Type**: `isGroupChat`
- **Group metadata**: `name`, `description`, `groupPicture`
- **Participants**: `participants[]` with:
  - `isPresent` (exit group)
  - `deletedForMe` (exit + hide)
  - `clearedAt` (clear chat)
  - `pinnedAt` (pin chat)
  - `notificationMutedAt/Until` + duration flags
- **Roles**: `admins[]`, `moderators[]`
- **Block state**: `isBlocked`

### Private message (`privateMessages`)
- Like `messages`, plus:
  - `messageType` includes `sharedcontent`
  - `sharedContent` snapshot (shared hashtag/post cards)
  - `storyReply` snapshot (reply linked to a story)

### Post (`posts`)
- **Core**: `userId`, `text`, `location?`
- **Media**: `media[]` (url/type/assetId + moderation summary)
- **Interests**: `interestCategories[]`, `interestSubCategories[]`
- **Replies**: `parentPostId?` (post-to-post reply)
- **Mentions**: `mentions[]` (user IDs parsed from `@username`)
- **Counters**: `viewCount`

### Story (`stories`)
- **Source**: `storyFrom: user|hashtag`, `userId?`, `hashtagId?`
- **Media**: `storyUrl`, `thumbnailUrl`, `type: image|video`
- **State**: `isActive`, `isHighlight`
- **Collections**: `collectionId`, `highlightCollectionId`

### Notification (`notifications`)
- **Recipient**: `userId`
- **Actor**: `senderId?`
- **Context**: `chatroomId?`
- **分类**: `category` (`ai|follows|alerts|news|updates|chats`)
- **Type**: `follow|unfollow|hashtag_message|ai_summary|alert|news|update|mention`
- **State**: `read`
- **Payload**: `summary`, `meta`

### Shortlink (`shortlinks`)
- `code` (6 chars), `data { screen, id, type?, name?, extra? }`, `createdBy`, `clickCount`, `expiresAt`
- See `docs/SHORTLINK_BACKEND_README.md`.

---

## 7) REST API (Module Index + Key Endpoints)

### Base path
- Server mounts all routes at `/` (see `src/app.js`), so route modules below are rooted at their mount points.

### Auth header
- **Most** endpoints: `Authorization: Bearer <accessToken>`

### Response envelope
- Many controllers respond as:
  - `{ "data": ... }` via `responseHandler(...)`
  - Errors: `{ "code": "ERR-XXX", "message": "..." }` via `errorHandler(...)`
- Some feature docs use `{ success: true }` shapes; treat those as **feature-specific** response formats.

### Route modules (mount points)
- `/user` (auth, onboarding, uploads, block/mute, interests, deletion, password, force logout)
- `/hashtag` (create/update/find/search, save/pin/mute/exit, invite/requests, roles/RBAC, subhashtags)
- `/interest` (categories/subcategories)
- `/chatroom` (hashtag chat view/join/clear/search/polls)
- `/private-chatroom` (list/group list, create group, clear/pin/mute/exit, participants/admins, polls)
- `/post` (CRUD, save, not interested, replies; nested `like`, `comment`, `reply`)
- `/feed` (feeds: base/new/around-me/people)
- `/follow`, `/like`, `/comment`, `/reply`, `/repost`
- `/stories`, `/highlight-collection`
- `/notification`
- `/settings` (referral system endpoints live here; see `docs/REFERRAL_SYSTEM.md`)
- `/ai` (image generation endpoint; see `docs/AI_GENERATE_IMAGE_API.md`)
- `/global-search` (see `docs/GLOBAL_SEARCH_API.md`)
- `/favourite` (places favorites; see `docs/favourite-api.md`)
- `/shortlink` (see `docs/SHORTLINK_BACKEND_README.md`)
- `/search-nearby`, `/search-places-details/:placeId` (Google Places)

### Notable endpoints (quick reference)
- **Health**: `GET /health-check`
- **User auth**: `POST /user/auth/stage-one|stage-two|stage-three|verify-otp|login|resend-otp|continue`
- **Upload**: `POST /user/upload` (S3; returns `assetId` + moderation status)
- **Feed**: `GET /feed`, `GET /feed/get-new-feed`, `GET /feed/get-around-me-feed`, `GET /feed/get-people-feed`
- **Global search**: `GET /global-search?keyword=...`
- **Shortlinks**: `POST /shortlink`, `GET /shortlink/:code`, `GET /shortlink/:code/stats`, `DELETE /shortlink/:code`
- **Reposts**: `POST /repost/add-repost`, `DELETE /repost/remove-repost`, `GET /repost?...`, `PUT /repost/:repostId`
- **Post replies (profile)**: `GET /post/replies/:userId` (see `docs/POST_REPLIES_API.md`)
- **Mute**: see `docs/MUTE_NOTIFICATION.md`
- **Exit chat**: see `docs/EXIT_CHATROOM.md`

---

## 8) Socket.IO API (Real-Time)

### Authentication
- Socket middleware validates JWT from `socket.handshake.query.token` (Bearer string supported).
- On success, server attaches `socket.userId` and typically expects clients to join rooms based on their identity/chatrooms.

### Major event groups (non-exhaustive)
- **Hashtag chat**
  - `JOIN_ROOM`, `SUB_HASHTAG_JOIN_ROOM`
  - `SEND_MESSAGE`, `EDIT_MESSAGE`, `DELETE_MESSAGE`
  - Reactions/comments: `EMOJI_REACT`, `MESSAGE_COMMENT_ADD`, `MESSAGE_COMMENT_LIST`
  - Delivery/reads/typing: `HASHTAG_USER_TYPING`, `HASHTAG_MESSAGE_DELIVERED`, `HASHTAG_MESSAGE_READ`, `MARK_HASHTAG_CHATROOM_AS_READ`
  - Polls: `POLL_VOTE`, `POLL_UNVOTE`, `POLL_VOTE_SCORE_GET`
- **Private chat**
  - `JOIN_PRIVATE_ROOM`, `SEND_PRIVATE_MESSAGE`, `EDIT_PRIVATE_MESSAGE`, `PRIV_EMOJI_REACT`
  - Group management: add/remove participants/admins/moderators
  - Delivery/reads/typing: `USER_TYPING`, `MESSAGE_DELIVERED`, `MESSAGE_READ`, `MARK_CHATROOM_AS_READ`
  - Delete-for-me (bulk): `PRIVATE_CHAT_DELETE_MESSAGES`
  - Story replies: `SEND_STORY_REPLY`
- **Media browser**: `getFiles` (see `docs/GET_FILES_SOCKET.md`)
- **Presence**: `HEARTBEAT`, `USER_STATUS_GET`
- **Active users**: `activeUsers` (see `docs/ACTIVE_USERS.md`)
- **Feed broadcast**: `newFeed`, `newFeedPost`, `newFeedHashtag` (see `docs/NEW_FEED_SOCKET.md`)
- **Impressions**: `addImpression` (see `docs/POST_IMPRESSION_SOCKET.md`)
- **AI chat**: `aiChatList|Create|Join|Delete|Archive|UpdateTitle|ClearAll`, `aiSendMessage`, `aiStopGeneration`, `aiRegenerate` (see `docs/AI_CHAT.md`)
- **AI voice**: `voiceChatStart|End|SessionUpdate|AudioAppend|...` (see `docs/AI_VOICE_CHAT.md`)

---

## 9) Media Uploads & Moderation

### Upload
- `POST /user/upload` accepts multipart `image` (also supports video/audio by mimetype detection).
- Response includes:
  - S3 URL
  - `assetId` (a `mediaAssets` record)
  - moderation status (`pending` / `skipped` for audio)

### Moderation
- Media items in `posts` and `messages` can carry:
  - `assetId`/`mediaAssetId`
  - `mediaModeration` summary (status, isBanned, reasons)
- **Assumption**: moderation runs via cron (`src/services/cron.js`) + Rekognition.

---

## 10) Notifications

### In-app notifications
- Stored in `notifications` collection and served via `/notification` endpoints.

### Push notifications (FCM)
- `firebase-admin` initialized in `src/index.js`.
- Used for:
  - private message notifications
  - hashtag message notifications
  - post mention notifications

### Mute behavior
- See `docs/MUTE_NOTIFICATION.md` for hashtag + private chatroom mute semantics.

---

## 11) Referral System & Invites

### Referral codes
- User can generate a 6-char referral code and share it.
- A new user can apply an invite code during signup or later (one-time).
- See `docs/REFERRAL_SYSTEM.md`.

### Hashtag invite activity
- Human-readable invite timeline endpoint:
  - `GET /hashtag/:hashtagId/invite-activity` (note: some docs use `/hashtags/...`; backend mount is `/hashtag/...`)
- See `docs/INVITE_ACTIVITY_API.md`.

---

## 12) Error Handling

### Common error contract
- Errors often return:
  - `code` (e.g., `ERR-003`)
  - `message` (mapped in `lib/constants/errorCodes.js`)
- See `lib/constants/errorCodes.js` for the canonical list.

---

## 13) Operations

### Docker
- `Dockerfile` uses `node:20-alpine` and installs `ffmpeg`.

### Observability
- HTTP logging via `morgan-body`.
- Application logs via `winston` logger helper.

### Admin ops
- **Force logout**: `POST /user/admin/force-logout/:userId` (requires admin token in practice).
- See `docs/FORCE_LOGOUT_INTEGRATION.md`.

---

## 14) Security & Privacy (What’s Implemented + Gaps)

### Implemented
- JWT auth + server-side token revocation (`tokenVersion`)
- Block/mute features for user safety
- Media moderation scaffolding (Rekognition)

### Gaps / recommendations
- **Do not commit secrets**: move env values + Firebase service account out of repo.
- `express-session` secret in `src/routes/index.routes.js` is hardcoded (`your_secret_key`) — move to env and rotate.
- `ai/generate-image` route has token verification commented out in code, while docs claim auth — align behavior (enable auth before production).

---

## 15) Release / Versioning (Backend)

- Package version: `1.0.0` (`package.json`).
- Recommended: add a `CHANGELOG.md` and tag releases; maintain API compatibility notes per mobile app version.

