const ffmpeg = require('fluent-ffmpeg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const awsConfig = require('../configs/aws.config');

// Set ffmpeg path - prefer system ffmpeg, fallback to installer
let ffmpegPath = null;
try {
  console.log('Checking for system ffmpeg...');
  // Check for system ffmpeg first (Docker/Linux)
  ffmpegPath = execSync('which ffmpeg', { encoding: 'utf-8' }).trim();
  console.log('[FFmpeg] Using system ffmpeg:', ffmpegPath);
} catch (e) {
  // Fallback to @ffmpeg-installer/ffmpeg for local development
  try {
    console.log('Checking for ffmpeg-installer...');
    // eslint-disable-next-line global-require
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpegPath = ffmpegInstaller.path;
    console.log('[FFmpeg] Using ffmpeg-installer:', ffmpegPath);
  } catch (e2) {
    console.error('[FFmpeg] No ffmpeg found! Thumbnail generation will fail.');
  }
}

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Create S3 client
const s3Client = new S3Client({
  region: awsConfig.AWS_REGION,
  credentials: {
    accessKeyId: awsConfig.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: awsConfig.AWS_S3_SECRET_ACCESS_KEY,
  },
});

// Promisify fs functions
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Download a file from a URL to a local path
 */
const downloadFile = (url, destPath) => new Promise((resolve, reject) => {
  console.log('[Thumbnail]   Downloading:', url.substring(0, 120), '...');
  const proto = url.startsWith('https') ? https : http;
  const file = fs.createWriteStream(destPath);
  proto.get(url, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      // Follow redirect
      console.log('[Thumbnail]   Following redirect to:', response.headers.location);
      file.close();
      fs.unlinkSync(destPath);
      return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
    }
    if (response.statusCode !== 200) {
      file.close();
      return reject(new Error(`Download failed with status ${response.statusCode}`));
    }
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      const stats = fs.statSync(destPath);
      console.log(`[Thumbnail]   Downloaded: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      resolve(destPath);
    });
    return null;
  }).on('error', (err) => {
    file.close();
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    reject(err);
  });
});

/**
 * Generate a presigned S3 URL for the video (avoids encoding issues with FFmpeg)
 */
const getPresignedVideoUrl = async (bucket, key) => {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    console.log('[Thumbnail]   Generated presigned URL (length:', signedUrl.length, ')');
    return signedUrl;
  } catch (err) {
    console.error('[Thumbnail]   Failed to generate presigned URL:', err.message);
    return null;
  }
};

exports.generateAndUploadThumbnail = async (videoFile) => {
  const startTime = Date.now();
  console.log('[Thumbnail] ====== START thumbnail generation ======');
  try {
    console.log('[Thumbnail] Step 1/8: Received video file object');
    console.log('[Thumbnail]   originalname:', videoFile.originalname || 'N/A');
    console.log('[Thumbnail]   mimetype:', videoFile.mimetype || 'N/A');
    console.log('[Thumbnail]   size:', videoFile.size ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB` : 'N/A');
    console.log('[Thumbnail]   path (local):', videoFile.path || 'N/A');
    console.log('[Thumbnail]   location (S3):', videoFile.location || 'N/A');
    console.log('[Thumbnail]   key:', videoFile.key || 'N/A');
    console.log('[Thumbnail]   bucket:', videoFile.bucket || 'N/A');

    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'video-thumbnails');
    console.log('[Thumbnail] Step 2/8: Creating temp directory:', tempDir);
    try {
      await mkdirAsync(tempDir, { recursive: true });
      console.log('[Thumbnail]   Temp directory ready');
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      console.log('[Thumbnail]   Temp directory already exists');
    }

    // Generate unique filename for the thumbnail
    const thumbnailFilename = `${uuidv4()}.jpg`;
    const thumbnailPath = path.join(tempDir, thumbnailFilename);
    console.log('[Thumbnail] Step 3/8: Thumbnail will be saved to:', thumbnailPath);

    // Resolve video source — download from S3 if no local path
    let videoPath = videoFile.path;
    let tempVideoPath = null;

    console.log('[Thumbnail] Step 4/8: Resolving video source path');
    if (!videoPath && videoFile.bucket && videoFile.key) {
      // S3 URLs with encoded chars (e.g. %23, %25) break FFmpeg.
      // Use a presigned URL or download the file locally.
      tempVideoPath = path.join(tempDir, `temp_video_${uuidv4()}.mp4`);
      console.log('[Thumbnail]   No local path — downloading video from S3 to:', tempVideoPath);

      // Try presigned URL first (faster, no full download needed for FFmpeg)
      const presignedUrl = await getPresignedVideoUrl(videoFile.bucket, videoFile.key);
      if (presignedUrl) {
        // Download via presigned URL (clean URL, no encoding issues)
        await downloadFile(presignedUrl, tempVideoPath);
        videoPath = tempVideoPath;
      } else {
        // Fallback: use raw S3 URL (may fail with special chars)
        console.log('[Thumbnail]   Presigned URL failed, falling back to raw S3 URL');
        videoPath = videoFile.location;
      }
    } else if (videoPath) {
      console.log('[Thumbnail]   Using local file path:', videoPath);
    } else {
      throw new Error('No video path or S3 location available');
    }

    // FFmpeg thumbnail extraction
    console.log('[Thumbnail] Step 5/8: Starting FFmpeg thumbnail extraction');
    console.log('[Thumbnail]   FFmpeg path:', ffmpegPath || 'NOT SET');
    console.log('[Thumbnail]   Input:', videoPath.substring(0, 120), videoPath.length > 120 ? '...' : '');
    console.log('[Thumbnail]   Output folder:', tempDir);
    console.log('[Thumbnail]   Output filename:', thumbnailFilename);
    console.log('[Thumbnail]   Target size: 640x360');

    const ffmpegStartTime = Date.now();

    // Generate thumbnail from video
    // IMPORTANT: resolve on 'end', NOT on 'filenames' — filenames fires before the file is written
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .on('start', (commandLine) => {
          console.log('[Thumbnail]   [FFmpeg] Spawned command:', commandLine);
        })
        .on('codecData', (data) => {
          console.log('[Thumbnail]   [FFmpeg] Input codec data:');
          console.log('[Thumbnail]     format:', data.format || 'N/A');
          console.log('[Thumbnail]     duration:', data.duration || 'N/A');
          console.log('[Thumbnail]     video:', data.video || 'N/A');
          console.log('[Thumbnail]     video_details:', data.video_details || 'N/A');
        })
        .on('filenames', (filenames) => {
          // This fires BEFORE the file is written — do NOT resolve here
          console.log('[Thumbnail]   [FFmpeg] Will create files:', filenames);
        })
        .on('stderr', (stderrLine) => {
          console.log('[Thumbnail]   [FFmpeg] stderr:', stderrLine);
        })
        .on('error', (err, stdout, stderr) => {
          const elapsed = Date.now() - ffmpegStartTime;
          console.error(`[Thumbnail]   [FFmpeg] ERROR after ${elapsed}ms:`, err.message);
          if (stderr) console.error('[Thumbnail]   [FFmpeg] stderr output:', stderr);
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .on('end', () => {
          // This fires AFTER the file is written — safe to resolve
          const elapsed = Date.now() - ffmpegStartTime;
          console.log(`[Thumbnail]   [FFmpeg] Completed in ${elapsed}ms`);
          resolve();
        })
        .screenshots({
          count: 1,
          folder: tempDir,
          filename: thumbnailFilename,
          size: '640x360',
        });
    });

    // Verify thumbnail was created
    console.log('[Thumbnail] Step 6/8: Verifying thumbnail file');
    if (!fs.existsSync(thumbnailPath)) {
      const dirContents = fs.readdirSync(tempDir);
      console.error('[Thumbnail]   Thumbnail NOT found at:', thumbnailPath);
      console.error('[Thumbnail]   Temp dir contents:', dirContents);
      throw new Error('Thumbnail file was not created by FFmpeg');
    }
    const thumbStats = fs.statSync(thumbnailPath);
    console.log('[Thumbnail]   Thumbnail exists:', thumbnailPath);
    console.log('[Thumbnail]   Thumbnail size:', `${(thumbStats.size / 1024).toFixed(2)} KB`);

    if (thumbStats.size === 0) {
      throw new Error('Thumbnail file is empty (0 bytes)');
    }

    // Upload thumbnail to S3 using a Buffer (avoids stream content-length issues)
    console.log('[Thumbnail] Step 7/8: Uploading thumbnail to S3');
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const key = `thumbnails/${Date.now()}_${thumbnailFilename}`;

    const uploadParams = {
      Bucket: awsConfig.AWS_BUCKET_NAME,
      Key: key,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
      ContentLength: thumbnailBuffer.length,
      ContentDisposition: 'inline',
    };

    console.log('[Thumbnail]   S3 bucket:', awsConfig.AWS_BUCKET_NAME);
    console.log('[Thumbnail]   S3 key:', key);
    console.log('[Thumbnail]   Upload size:', `${(thumbnailBuffer.length / 1024).toFixed(2)} KB`);

    const s3StartTime = Date.now();
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`[Thumbnail]   S3 upload completed in ${Date.now() - s3StartTime}ms`);

    // Clean up temporary files
    console.log('[Thumbnail] Step 8/8: Cleaning up temporary files');
    try {
      if (fs.existsSync(thumbnailPath)) {
        await unlinkAsync(thumbnailPath);
        console.log('[Thumbnail]   Deleted thumbnail:', thumbnailPath);
      }
      if (tempVideoPath && fs.existsSync(tempVideoPath)) {
        await unlinkAsync(tempVideoPath);
        console.log('[Thumbnail]   Deleted temp video:', tempVideoPath);
      }
    } catch (cleanupError) {
      console.warn('[Thumbnail]   Cleanup warning:', cleanupError.message);
    }

    // Return the S3 URL
    const thumbnailUrl = `https://${awsConfig.AWS_BUCKET_NAME}.s3.${awsConfig.AWS_REGION}.amazonaws.com/${key}`;
    const totalElapsed = Date.now() - startTime;
    console.log(`[Thumbnail] ====== DONE in ${totalElapsed}ms ======`);
    console.log('[Thumbnail] Final URL:', thumbnailUrl);
    return thumbnailUrl;
  } catch (error) {
    const totalElapsed = Date.now() - startTime;
    console.error(`[Thumbnail] ====== FAILED after ${totalElapsed}ms ======`);
    console.error('[Thumbnail] Error:', error.message);
    console.error('[Thumbnail] Stack:', error.stack);
    const defaultThumbnailUrl = 'https://talkhub-bucket.s3.eu-central-1.amazonaws.com/images/1763228617803_684955-200.png';
    console.log('[Thumbnail] Using default thumbnail URL:', defaultThumbnailUrl);
    return defaultThumbnailUrl;
  }
};

/**
 * Determine if a file is a video based on its mimetype
 * @param {string} mimetype - The file's mimetype
 * @returns {boolean} - True if the file is a video
 */
exports.isVideo = (mimetype) => {
  const videoMimeTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv',
  ];
  return videoMimeTypes.includes(mimetype);
};

/**
 * Determine if a file is an image based on its mimetype
 * @param {string} mimetype - The file's mimetype
 * @returns {boolean} - True if the file is an image
 */
exports.isImage = (mimetype) => {
  const imageMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];
  return imageMimeTypes.includes(mimetype);
};
