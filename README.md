# TalkHub Server

Backend API server for TalkHub — an invite-only social + chat platform.

## Tech Stack

- **Runtime**: Node.js + Express
- **Database**: MongoDB (Mongoose ODM) + Redis (ioredis)
- **Real-time**: Socket.IO (private/group/public chats)
- **Auth**: JWT, Google OAuth, Apple Sign-In, OTP (email + SMS)
- **Storage**: AWS S3 + CloudFront CDN
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Email**: Nodemailer (AWS SES / Outlook SMTP)
- **SMS**: Twilio
- **Media**: FFmpeg (video thumbnails), AWS Rekognition (content moderation)

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB Atlas cluster (or local MongoDB)
- Redis instance
- AWS account (S3, SES, Rekognition)
- Firebase project (FCM)
- Twilio account (SMS)

### Installation

```bash
npm install
```

### Environment

Copy the example env and fill in your credentials:

```bash
cp .env.example .env.dev
```

### Run Development Server

```bash
npm run dev
```

The server starts on `http://localhost:3800` by default.

### Run Staging Server

```bash
npm run stage
```

## Project Structure

```
src/
├── controllers/     # Route handlers
├── events/          # Socket.IO event handlers
├── models/          # Mongoose schemas
├── queries/         # MongoDB aggregation pipelines
├── routes/          # Express route definitions
├── services/        # Business logic & external integrations
└── validators/      # Joi request validation schemas

lib/
├── configs/         # App configuration (DB, AWS, env)
├── helpers/         # Utility functions (logger, response handler)
├── middlewares/     # Auth, validation, upload middlewares
└── templates/       # Email HTML/text templates
```

## Key Features

- **Authentication** — Email/phone OTP, Google, Apple sign-in with multi-step onboarding
- **Posts & Feed** — Create, edit, delete posts with media, mentions, and interest categories
- **Real-time Chat** — Hashtag (public) chats, private DMs, and group chats with admin controls
- **Stories** — Ephemeral stories with view tracking and notifications
- **Notifications** — Push (FCM) + in-app notifications for likes, comments, mentions, follows
- **Search** — Global search across users, posts, hashtags, and media
- **Short Links** — URL shortener for deep linking into the app
- **Content Moderation** — AWS Rekognition-based media moderation
- **Referral System** — Invite codes with waitlist management

## Documentation

Detailed API docs are in the `docs/` directory:

- [Onboarding API Guide](ONBOARDING_API.md)
- [Onboarding Flow](ONBOARDING_FLOW.md)
- See `docs/` for feature-specific documentation

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with nodemon |
| `npm start` | Start dev server without auto-reload |
| `npm run stage` | Start staging server |
| `npm run prettier` | Format code with Prettier |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |

## License

Proprietary — TalkHub
