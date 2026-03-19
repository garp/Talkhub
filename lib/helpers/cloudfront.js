/**
 * CloudFront URL Helper
 *
 * Converts S3 URLs to CloudFront CDN URLs for faster content delivery.
 * When CloudFront is enabled, all S3 URLs are automatically converted.
 */

const awsConfig = require('../configs/aws.config');

/**
 * Check if CloudFront is enabled
 * @returns {boolean}
 */
const isCloudFrontEnabled = () => (
  awsConfig.CLOUDFRONT_ENABLED && awsConfig.CLOUDFRONT_DOMAIN
);

/**
 * Get the CloudFront domain
 * @returns {string|null}
 */
const getCloudFrontDomain = () => awsConfig.CLOUDFRONT_DOMAIN || null;

/**
 * Convert an S3 URL to a CloudFront URL
 *
 * Supports both formats:
 * - https://bucket-name.s3.region.amazonaws.com/path/to/file
 * - https://s3.region.amazonaws.com/bucket-name/path/to/file
 *
 * @param {string} s3Url - The S3 URL to convert
 * @returns {string} - CloudFront URL if enabled, otherwise original S3 URL
 */
const toCloudFrontUrl = (s3Url) => {
  if (!s3Url || typeof s3Url !== 'string') {
    return s3Url;
  }

  if (!isCloudFrontEnabled()) {
    return s3Url;
  }

  // Already a CloudFront URL
  if (s3Url.includes('.cloudfront.net')) {
    return s3Url;
  }

  // Not an S3 URL
  if (!s3Url.includes('amazonaws.com') && !s3Url.includes('s3.')) {
    return s3Url;
  }

  try {
    const url = new URL(s3Url);
    const bucketName = awsConfig.AWS_BUCKET_NAME;

    // Extract the path/key from S3 URL
    let objectKey = '';

    // Format 1: https://bucket-name.s3.region.amazonaws.com/path/to/file
    if (url.hostname.startsWith(bucketName)) {
      objectKey = url.pathname;
    } else if (url.pathname.startsWith(`/${bucketName}/`)) {
      // Format 2: https://s3.region.amazonaws.com/bucket-name/path/to/file
      objectKey = url.pathname.replace(`/${bucketName}`, '');
    } else if (url.hostname.includes('.s3.')) {
      // Format 3: https://bucket-name.s3.amazonaws.com/path/to/file (legacy)
      objectKey = url.pathname;
    } else {
      // Unknown format, return original
      return s3Url;
    }

    // Construct CloudFront URL
    const cloudfrontDomain = awsConfig.CLOUDFRONT_DOMAIN.replace(/^https?:\/\//, '');
    return `https://${cloudfrontDomain}${objectKey}`;
  } catch (error) {
    // If URL parsing fails, return original
    console.error('Error converting S3 URL to CloudFront:', error.message);
    return s3Url;
  }
};

/**
 * Convert an array of S3 URLs to CloudFront URLs
 * @param {string[]} urls - Array of S3 URLs
 * @returns {string[]} - Array of CloudFront URLs
 */
const toCloudFrontUrls = (urls) => {
  if (!Array.isArray(urls)) {
    return urls;
  }
  return urls.map((url) => toCloudFrontUrl(url));
};

/**
 * Convert S3 URL back to direct S3 URL (for internal operations)
 * @param {string} cloudFrontUrl - The CloudFront URL
 * @returns {string} - S3 URL
 */
const toS3Url = (cloudFrontUrl) => {
  if (!cloudFrontUrl || typeof cloudFrontUrl !== 'string') {
    return cloudFrontUrl;
  }

  if (!cloudFrontUrl.includes('.cloudfront.net')) {
    return cloudFrontUrl;
  }

  try {
    const url = new URL(cloudFrontUrl);
    const bucketName = awsConfig.AWS_BUCKET_NAME;
    const region = awsConfig.AWS_REGION;

    // Construct S3 URL
    return `https://${bucketName}.s3.${region}.amazonaws.com${url.pathname}`;
  } catch (error) {
    console.error('Error converting CloudFront URL to S3:', error.message);
    return cloudFrontUrl;
  }
};

/**
 * Recursively convert all S3 URLs in an object to CloudFront URLs
 * Useful for transforming API responses
 *
 * @param {Object|Array|string} data - Data containing URLs
 * @param {string[]} urlFields - Field names that contain URLs (default: common media fields)
 * @returns {Object|Array|string} - Data with converted URLs
 */
const transformUrls = (data, urlFields = [
  // Common URL fields
  'url', 'imageUrl', 'videoUrl', 'thumbnailUrl', 'profilePicture',
  'coverImage', 'mediaUrl', 'fileUrl', 'hashtagPhoto', 'hashtagBanner',
  'storyUrl', 'postMedia', 'avatar', 'banner', 'photo', 'image', 'video',
  'bannerPicture', 'groupPicture', 'coverUrl', 'icon', 'backgroundImage',
  'hashtagPicture',
  // Video/Audio specific fields
  'videoThumbnail', 'audioUrl', 'previewUrl', 'hlsUrl',
  'parentMessageMedia', 'messageMedia',
  // Media field (can be string or array)
  'media',
]) => {
  if (!isCloudFrontEnabled()) {
    return data;
  }

  if (typeof data === 'string') {
    // Check if it looks like an S3 URL
    if (data.includes('amazonaws.com') || data.includes('s3.')) {
      return toCloudFrontUrl(data);
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => transformUrls(item, urlFields));
  }

  if (data && typeof data === 'object') {
    // Handle special object types that should not be spread
    // Date - return as-is (JSON.stringify handles it correctly)
    if (data instanceof Date) {
      return data;
    }

    // ObjectId - convert to string
    if (data._bsontype === 'ObjectId' || (data.buffer && data.id)) {
      return data.toString ? data.toString() : data;
    }

    // Handle Mongoose documents by converting to plain JSON first
    // This ensures ObjectIds are properly serialized as strings
    let plainData = data;
    if (typeof data.toJSON === 'function') {
      plainData = data.toJSON();
    }

    const transformed = { ...plainData };

    Object.keys(transformed).forEach((key) => {
      const value = transformed[key];

      // If the field name suggests it's a URL field
      if (urlFields.includes(key)) {
        if (typeof value === 'string') {
          transformed[key] = toCloudFrontUrl(value);
        } else if (Array.isArray(value)) {
          // Check if array contains strings or objects
          if (value.length > 0 && typeof value[0] === 'string') {
            transformed[key] = toCloudFrontUrls(value);
          } else if (value.length > 0 && typeof value[0] === 'object') {
            // Array of objects - recursively transform each object
            transformed[key] = value.map((item) => transformUrls(item, urlFields));
          }
        }
      } else if (key === 'photos' || key === 'images' || key === 'videos') {
        // If it's 'photos' or similar array fields (media is now in urlFields)
        if (Array.isArray(value)) {
          // Check if array contains strings or objects
          if (value.length > 0 && typeof value[0] === 'string') {
            transformed[key] = toCloudFrontUrls(value);
          } else {
            // Array of objects - recursively transform each object
            transformed[key] = value.map((item) => transformUrls(item, urlFields));
          }
        }
      } else if (value && typeof value === 'object') {
        // Check if it's a Date - keep as-is
        if (value instanceof Date) {
          transformed[key] = value;
        } else if (value._bsontype === 'ObjectId' || (value.buffer && value.id)) {
          // Check if it's an ObjectId - convert to string
          transformed[key] = value.toString ? value.toString() : value;
        } else {
          // Recursively process nested objects
          transformed[key] = transformUrls(value, urlFields);
        }
      }
    });

    return transformed;
  }

  return data;
};

module.exports = {
  isCloudFrontEnabled,
  getCloudFrontDomain,
  toCloudFrontUrl,
  toCloudFrontUrls,
  toS3Url,
  transformUrls,
};
