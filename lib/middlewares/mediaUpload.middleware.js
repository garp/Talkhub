const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const env = require('../configs/aws.config');
const { toCloudFrontUrl } = require('../helpers/cloudfront');
const thumbnailGenerator = require('../helpers/thumbnailGenerator');

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

// Define allowed file types
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'];
const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac'];
const allowedFileTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedAudioTypes];

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Only images, videos, and audio files are allowed.`), false);
  }
};

// Determine folder based on file type
const getFolder = (mimetype) => {
  if (allowedImageTypes.includes(mimetype)) {
    return 'images';
  } if (allowedVideoTypes.includes(mimetype)) {
    return 'videos';
  } if (allowedAudioTypes.includes(mimetype)) {
    return 'audios';
  }
  return 'other';
};

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: env.AWS_BUCKET_NAME,
    // acl: 'public-read',
    contentType(req, file, cb) {
      // Explicitly set the content type based on the file's mimetype
      cb(null, file.mimetype);
    },
    metadata: (req, file, cb) => {
      let mediaType = 'other';
      if (allowedImageTypes.includes(file.mimetype)) {
        mediaType = 'image';
      } else if (allowedVideoTypes.includes(file.mimetype)) {
        mediaType = 'video';
      } else if (allowedAudioTypes.includes(file.mimetype)) {
        mediaType = 'audio';
      }

      cb(null, {
        fieldName: file.fieldname,
        mediaType,
      });
    },
    key: (req, file, cb) => {
      const folder = getFolder(file.mimetype);
      const fileName = `${folder}/${Date.now().toString()}_${file.originalname}`;
      cb(null, fileName);
    },
    contentDisposition: (req, file, cb) => {
      // Set inline content disposition for videos and images to play/display in browser
      cb(null, 'inline');
    },
  }),
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB file size limit
  },
});

/**
 * Middleware to convert S3 URLs to CloudFront URLs after upload
 */
const convertToCloudFrontUrls = (req, res, next) => {
  if (req.file && req.file.location) {
    req.file.location = toCloudFrontUrl(req.file.location);
    req.file.cloudFrontUrl = req.file.location;
  }

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files = req.files.map((file) => ({
        ...file,
        location: toCloudFrontUrl(file.location),
        cloudFrontUrl: toCloudFrontUrl(file.location),
      }));
    } else {
      Object.keys(req.files).forEach((fieldName) => {
        req.files[fieldName] = req.files[fieldName].map((file) => ({
          ...file,
          location: toCloudFrontUrl(file.location),
          cloudFrontUrl: toCloudFrontUrl(file.location),
        }));
      });
    }
  }

  next();
};

/**
 * Middleware to generate thumbnails for uploaded videos
 * Adds thumbnailUrl to each video file object
 */
const generateVideoThumbnails = async (req, res, next) => {
  try {
    // Handle single file upload
    if (req.file && thumbnailGenerator.isVideo(req.file.mimetype)) {
      console.log('[Thumbnail] Generating thumbnail for single video upload');
      const thumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(req.file);
      req.file.thumbnailUrl = toCloudFrontUrl(thumbnailUrl);
      console.log('[Thumbnail] Generated:', req.file.thumbnailUrl);
    }

    // Handle multiple files upload (array)
    if (req.files && Array.isArray(req.files)) {
      const videoFiles = req.files.filter((file) => thumbnailGenerator.isVideo(file.mimetype));
      if (videoFiles.length > 0) {
        console.log(`[Thumbnail] Generating thumbnails for ${videoFiles.length} videos`);
        await Promise.all(
          req.files.map(async (file, index) => {
            if (thumbnailGenerator.isVideo(file.mimetype)) {
              const thumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(file);
              req.files[index].thumbnailUrl = toCloudFrontUrl(thumbnailUrl);
              console.log(`[Thumbnail] Generated for file ${index}:`, req.files[index].thumbnailUrl);
            }
          }),
        );
      }
    }

    // Handle multiple files upload (object with field names)
    if (req.files && !Array.isArray(req.files)) {
      await Promise.all(
        Object.keys(req.files).map(async (fieldName) => {
          await Promise.all(
            req.files[fieldName].map(async (file, index) => {
              if (thumbnailGenerator.isVideo(file.mimetype)) {
                console.log(`[Thumbnail] Generating thumbnail for ${fieldName}[${index}]`);
                const thumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(file);
                req.files[fieldName][index].thumbnailUrl = toCloudFrontUrl(thumbnailUrl);
                console.log('[Thumbnail] Generated:', req.files[fieldName][index].thumbnailUrl);
              }
            }),
          );
        }),
      );
    }

    next();
  } catch (error) {
    console.error('[Thumbnail] Error generating thumbnails:', error);
    // Don't fail the upload if thumbnail generation fails
    next();
  }
};

exports.upload = upload;
exports.convertToCloudFrontUrls = convertToCloudFrontUrls;
exports.generateVideoThumbnails = generateVideoThumbnails;

// For backward compatibility
exports.imageUpload = upload;
