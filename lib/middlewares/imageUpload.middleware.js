const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const env = require('../configs/aws.config');
const { toCloudFrontUrl } = require('../helpers/cloudfront');

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

// Define allowed file types
const allowedImageTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];
const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'];
const allowedDocumentTypes = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/csv',
];
const allowedFileTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedDocumentTypes];

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Only images, videos, and documents (e.g. PDF) are allowed.`), false);
  }
};

// Determine folder based on file type
const getFolder = (mimetype) => {
  if (allowedImageTypes.includes(mimetype)) {
    return 'images';
  }
  if (allowedVideoTypes.includes(mimetype)) {
    return 'videos';
  }
  if (allowedDocumentTypes.includes(mimetype)) {
    return 'documents';
  }
  return 'other';
};

const getMediaType = (mimetype) => {
  if (allowedImageTypes.includes(mimetype)) return 'image';
  if (allowedVideoTypes.includes(mimetype)) return 'video';
  if (allowedDocumentTypes.includes(mimetype)) return 'document';
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
      cb(null, {
        fieldName: file.fieldname,
        mediaType: getMediaType(file.mimetype),
      });
    },
    key: (req, file, cb) => {
      const folder = getFolder(file.mimetype);
      const fileName = `${folder}/${Date.now().toString()}_${file.originalname}`;
      cb(null, fileName);
    },
  }),
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB file size limit
  },
});

/**
 * Middleware to convert S3 URLs to CloudFront URLs after upload
 * Should be used after multer upload middleware
 */
const convertToCloudFrontUrls = (req, res, next) => {
  // Convert single file
  if (req.file && req.file.location) {
    req.file.location = toCloudFrontUrl(req.file.location);
    req.file.cloudFrontUrl = req.file.location;
  }

  // Convert multiple files
  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files = req.files.map((file) => ({
        ...file,
        location: toCloudFrontUrl(file.location),
        cloudFrontUrl: toCloudFrontUrl(file.location),
      }));
    } else {
      // Handle field-based multiple files (e.g., upload.fields())
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

exports.upload = upload;
exports.convertToCloudFrontUrls = convertToCloudFrontUrls;
