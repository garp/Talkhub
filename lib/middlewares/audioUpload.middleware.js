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

// Define allowed audio file types
const allowedAudioTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/x-aac',
  'audio/flac',
  'audio/x-flac',
];

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  if (allowedAudioTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Only audio files are allowed.`), false);
  }
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
        mediaType: 'audio',
      });
    },
    key: (req, file, cb) => {
      const fileName = `audios/${Date.now().toString()}_${file.originalname}`;
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
    }
  }

  next();
};

exports.upload = upload;
exports.convertToCloudFrontUrls = convertToCloudFrontUrls;
