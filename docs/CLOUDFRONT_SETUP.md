# CloudFront CDN Setup Guide

This guide explains how CloudFront is integrated with the TalkHub backend for serving media files via CDN.

## Overview

CloudFront acts as a CDN (Content Delivery Network) in front of your S3 bucket, providing:
- **Faster content delivery** via edge locations worldwide
- **Lower latency** for users far from your S3 region
- **Reduced S3 costs** through caching
- **HTTPS by default**

## Architecture

```
User Request ──► CloudFront Edge ──► S3 Bucket
                     │
                     └── Cached at edge for future requests
```

---

## AWS Console Setup

### Step 1: Configure CloudFront Origin

1. Go to your CloudFront distribution: `E1KMSKTS6GZHLE`
2. Click **Origins** tab
3. Click **Create origin**
4. Configure:
   - **Origin domain**: `chitchat-bucket.s3.eu-central-1.amazonaws.com`
   - **Origin path**: Leave empty
   - **Name**: `S3-chitchat-bucket`
   - **Origin access**: 
     - Select **Origin access control settings (recommended)**
     - Click **Create new OAC**
     - Name: `chitchat-bucket-oac`
     - Signing behavior: **Sign requests (recommended)**
5. Click **Create origin**

### Step 2: Update S3 Bucket Policy

After creating the origin, AWS will provide a bucket policy. Add it to your S3 bucket:

1. Go to S3 → `chitchat-bucket` → **Permissions** → **Bucket policy**
2. Add this policy (replace with your actual values):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCloudFrontServicePrincipal",
            "Effect": "Allow",
            "Principal": {
                "Service": "cloudfront.amazonaws.com"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::chitchat-bucket/*",
            "Condition": {
                "StringEquals": {
                    "AWS:SourceArn": "arn:aws:cloudfront::061051251306:distribution/E1KMSKTS6GZHLE"
                }
            }
        }
    ]
}
```

### Step 3: Configure Default Behavior

1. Go to **Behaviors** tab
2. Edit the default behavior or create new:
   - **Path pattern**: `*` (default) or specific paths like `/images/*`
   - **Origin**: Select your S3 origin
   - **Viewer protocol policy**: **Redirect HTTP to HTTPS**
   - **Allowed HTTP methods**: GET, HEAD
   - **Cache policy**: `CachingOptimized` (recommended)
   - **Origin request policy**: `CORS-S3Origin` (if needed)

### Step 4: Configure Cache Settings (Optional)

For optimal performance:
- **TTL**: Default 86400 seconds (24 hours)
- **Compress objects automatically**: Yes
- **Cache based on headers**: None (for static content)

---

## Environment Configuration

Add these to your `.env` file:

```env
# CloudFront CDN
CLOUDFRONT_DOMAIN=d2pli4jj39ypcz.cloudfront.net
CLOUDFRONT_ENABLED=true
```

| Variable | Description |
|----------|-------------|
| `CLOUDFRONT_DOMAIN` | Your CloudFront distribution domain |
| `CLOUDFRONT_ENABLED` | Set to `true` to enable URL conversion |

---

## How It Works

### Automatic URL Conversion

When `CLOUDFRONT_ENABLED=true`, all S3 URLs are automatically converted:

**Before (S3 URL):**
```
https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/123_photo.jpg
```

**After (CloudFront URL):**
```
https://d2pli4jj39ypcz.cloudfront.net/images/123_photo.jpg
```

### Upload Middleware Integration

The upload middlewares automatically convert URLs after upload:

```javascript
// After upload, req.file.location contains CloudFront URL
app.post('/upload', upload.single('image'), convertToCloudFrontUrls, (req, res) => {
  res.json({ url: req.file.location }); // CloudFront URL
});
```

---

## Helper Functions

### Convert Single URL

```javascript
const { toCloudFrontUrl } = require('./lib/helpers/cloudfront');

const s3Url = 'https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/photo.jpg';
const cdnUrl = toCloudFrontUrl(s3Url);
// https://d2pli4jj39ypcz.cloudfront.net/images/photo.jpg
```

### Convert Multiple URLs

```javascript
const { toCloudFrontUrls } = require('./lib/helpers/cloudfront');

const urls = [
  'https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/1.jpg',
  'https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/2.jpg',
];
const cdnUrls = toCloudFrontUrls(urls);
```

### Transform API Response

```javascript
const { transformUrls } = require('./lib/helpers/cloudfront');

const apiResponse = {
  user: {
    name: 'John',
    profilePicture: 'https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/avatar.jpg',
    posts: [
      { imageUrl: 'https://...s3.../post1.jpg' },
      { imageUrl: 'https://...s3.../post2.jpg' },
    ]
  }
};

const transformed = transformUrls(apiResponse);
// All S3 URLs are now CloudFront URLs
```

---

## Testing

### Verify CloudFront is Working

```bash
# Test S3 URL (should work but slower)
curl -I "https://chitchat-bucket.s3.eu-central-1.amazonaws.com/images/test.jpg"

# Test CloudFront URL (should work and be faster)
curl -I "https://d2pli4jj39ypcz.cloudfront.net/images/test.jpg"
```

### Check Cache Status

Look for these headers in CloudFront response:
- `X-Cache: Hit from cloudfront` - Served from cache
- `X-Cache: Miss from cloudfront` - Fetched from S3

---

## Troubleshooting

### 403 Forbidden Error

1. Check S3 bucket policy includes CloudFront access
2. Verify Origin Access Control is configured
3. Ensure the object exists in S3

### 404 Not Found

1. Verify the file path is correct
2. Check if the file exists in S3
3. Ensure path pattern in CloudFront behavior matches

### Stale Content

To invalidate cache:
1. Go to CloudFront → Distribution → **Invalidations**
2. Create invalidation with path: `/*` (all) or `/images/specific-file.jpg`

---

## Cost Optimization

- Use longer TTL for static content (images, videos)
- Compress content to reduce data transfer
- Use Price Class 100 or 200 if users are primarily in specific regions

---

## Files Modified

| File | Description |
|------|-------------|
| `lib/configs/aws.config.js` | Added CloudFront config |
| `lib/helpers/cloudfront.js` | URL conversion helpers |
| `lib/middlewares/imageUpload.middleware.js` | Auto-convert after upload |
| `lib/middlewares/mediaUpload.middleware.js` | Auto-convert after upload |
| `lib/middlewares/audioUpload.middleware.js` | Auto-convert after upload |
| `.env.dev` | Added CloudFront env vars |
