const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const awsConfig = require('../../lib/configs/aws.config');

const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);

// Create S3 client
const s3Client = new S3Client({
  region: awsConfig.AWS_REGION,
  credentials: {
    accessKeyId: awsConfig.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: awsConfig.AWS_S3_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate an image using OpenAI DALL-E API
 * @param {Object} options - Generation options
 * @param {string} options.prompt - The prompt to generate the image from
 * @param {string} [options.size='1024x1024'] - Image size (1024x1024, 1024x1792, 1792x1024)
 * @param {string} [options.quality='standard'] - Image quality (standard, hd)
 * @param {string} [options.style='vivid'] - Image style (vivid, natural)
 * @returns {Promise<Object>} - OpenAI response with image URL
 */
const generateImage = async ({
  prompt,
  size = '1024x1024',
  quality = 'standard',
  style = 'vivid',
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      style,
      response_format: 'url',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 120000, // 2 minute timeout for image generation
    },
  );

  return response.data;
};

/**
 * Download image from URL as buffer
 * @param {string} imageUrl - The URL of the image to download
 * @returns {Promise<Buffer>} - Image data as buffer
 */
const downloadImage = async (imageUrl) => {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(response.data);
};

/**
 * Upload image buffer to S3
 * @param {Buffer} imageBuffer - The image data as buffer
 * @param {string} [contentType='image/png'] - The content type of the image
 * @returns {Promise<string>} - The S3 URL of the uploaded image
 */
const uploadToS3 = async (imageBuffer, contentType = 'image/png') => {
  const filename = `${uuidv4()}.png`;
  const key = `ai-generated/${Date.now()}_${filename}`;

  const uploadParams = {
    Bucket: awsConfig.AWS_BUCKET_NAME,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    ContentDisposition: 'inline',
  };

  await s3Client.send(new PutObjectCommand(uploadParams));

  // Return the S3 URL
  const s3Url = `https://${awsConfig.AWS_BUCKET_NAME}.s3.${awsConfig.AWS_REGION}.amazonaws.com/${key}`;
  return s3Url;
};

/**
 * Upload image buffer to local file system (fallback when S3 fails)
 * @param {Buffer} imageBuffer - The image data as buffer
 * @param {string} userId - The user ID for the directory
 * @returns {Promise<string>} - The local URL path of the uploaded image
 */
const uploadToLocal = async (imageBuffer, userId) => {
  // Create directory structure: public/ai-image/{userId}/
  const publicDir = path.join(process.cwd(), 'public');
  const aiImageDir = path.join(publicDir, 'ai-image');
  const userDir = path.join(aiImageDir, userId.toString());

  // Create directories if they don't exist
  try {
    await mkdirAsync(publicDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  try {
    await mkdirAsync(aiImageDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  try {
    await mkdirAsync(userDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Generate filename with timestamp
  const timestamp = Date.now();
  const filename = `${timestamp}.png`;
  const filePath = path.join(userDir, filename);

  // Write file to disk
  await writeFileAsync(filePath, imageBuffer);

  // Return the relative URL path (accessible via static file serving)
  const relativePath = `/ai-image/${userId}/${filename}`;
  return relativePath;
};

/**
 * Generate an image and upload it to S3 (with local fallback)
 * @param {Object} options - Generation options
 * @param {string} options.prompt - The prompt to generate the image from
 * @param {string} [options.userId] - User ID for local fallback path
 * @param {string} [options.size='1024x1024'] - Image size
 * @param {string} [options.quality='standard'] - Image quality
 * @param {string} [options.style='vivid'] - Image style
 * @returns {Promise<Object>} - Object containing URL and metadata
 */
exports.generateAndUploadImage = async ({
  prompt,
  userId = 'anonymous',
  size = '1024x1024',
  quality = 'standard',
  style = 'vivid',
}) => {
  // Step 1: Generate image using OpenAI
  const openaiResponse = await generateImage({
    prompt,
    size,
    quality,
    style,
  });

  if (!openaiResponse.data || !openaiResponse.data[0] || !openaiResponse.data[0].url) {
    throw new Error('Failed to generate image: No image URL in response');
  }

  const generatedImageUrl = openaiResponse.data[0].url;
  const revisedPrompt = openaiResponse.data[0].revised_prompt || prompt;

  // Step 2: Download the generated image
  const imageBuffer = await downloadImage(generatedImageUrl);

  // Step 3: Try S3 first, fallback to local storage
  let imageUrl;
  let storageType = 's3';

  try {
    imageUrl = await uploadToS3(imageBuffer, 'image/png');
    storageType = 's3';
  } catch (s3Error) {
    console.error('S3 upload failed, falling back to local storage:', s3Error.message);

    // Fallback to local storage
    try {
      imageUrl = await uploadToLocal(imageBuffer, userId);
      storageType = 'local';
    } catch (localError) {
      console.error('Local storage also failed:', localError.message);
      throw new Error(`Failed to store image: S3 error: ${s3Error.message}, Local error: ${localError.message}`);
    }
  }

  return {
    url: imageUrl,
    storageType,
    originalPrompt: prompt,
    revisedPrompt,
    size,
    quality,
    style,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Validate image generation parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} - Validated and normalized parameters
 */
exports.validateParams = ({
  prompt,
  size,
  quality,
  style,
}) => {
  const validSizes = ['1024x1024', '1024x1792', '1792x1024'];
  const validQualities = ['standard', 'hd'];
  const validStyles = ['vivid', 'natural'];

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  if (prompt.length > 4000) {
    throw new Error('Prompt must be 4000 characters or less');
  }

  return {
    prompt: prompt.trim(),
    size: validSizes.includes(size) ? size : '1024x1024',
    quality: validQualities.includes(quality) ? quality : 'standard',
    style: validStyles.includes(style) ? style : 'vivid',
  };
};
