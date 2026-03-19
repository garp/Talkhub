/**
 * Script to bulk upload category icons to S3 and update MongoDB documents
 *
 * Usage: node scripts/uploadCategoryIcons.js
 */

require('dotenv').config({ path: '.env.dev' });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const { CLOUDFRONT_DOMAIN } = process.env;
const S3_FOLDER = 'images/categoriesimages';
const ICONS_DIR = path.join(__dirname, '..', 'black_icons');

// Import the model
const InterestCategory = require('../src/models/interestCategory.model');

/**
 * Upload a file to S3
 * @param {string} filePath - Local file path
 * @param {string} fileName - File name for S3
 * @returns {Promise<string>} - CloudFront URL
 */
async function uploadToS3(filePath, fileName) {
  const fileContent = fs.readFileSync(filePath);
  const contentType = 'image/png'; // All category icons are PNG files

  // Sanitize filename for S3 (replace spaces and special chars)
  const sanitizedFileName = fileName
    .replace(/[&]/g, 'and')
    .replace(/[,]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  const s3Key = `${S3_FOLDER}/${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Return CloudFront URL
  const cloudFrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;
  console.log(`  ✓ Uploaded: ${fileName} -> ${cloudFrontUrl}`);

  return cloudFrontUrl;
}

/**
 * Get category name from filename
 * @param {string} filename - The filename (e.g., "Arts & culture.png")
 * @returns {string} - Category name (e.g., "Arts & culture")
 */
function getCategoryNameFromFilename(filename) {
  // Remove .png extension and handle special cases
  const name = filename.replace(/\.png$/i, '');

  // Handle Sports-1.png -> skip (it's a duplicate)
  if (name === 'Sports-1') {
    return null; // Skip this duplicate
  }

  return name;
}

/**
 * Generate slug from category name
 * @param {string} name - Category name
 * @returns {string} - URL-friendly slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[&]/g, 'and')
    .replace(/[,]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Create or update a category
 * @param {string} name - Category name
 * @param {string} iconUrl - CloudFront URL for the icon
 * @param {number} order - Display order
 * @returns {Promise<Object>} - The category document
 */
async function createOrUpdateCategory(name, iconUrl, order) {
  const slug = generateSlug(name);

  // Try to find existing category
  let category = await InterestCategory.findOne({
    $or: [{ name }, { slug }],
  });

  if (category) {
    // Update existing category
    category.icon = iconUrl;
    await category.save();
    return { category, created: false };
  }

  // Create new category
  category = await InterestCategory.create({
    name,
    slug,
    icon: iconUrl,
    order,
    isActive: true,
  });

  return { category, created: true };
}

/**
 * Main function to process all icons
 */
async function main() {
  console.log('===========================================');
  console.log('Category Icons Upload Script');
  console.log('===========================================\n');

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB\n');

  // Get all PNG files from black_icons directory
  const files = fs.readdirSync(ICONS_DIR).filter((file) => file.endsWith('.png'));
  console.log(`Found ${files.length} icon files to upload\n`);

  // Check existing categories
  const existingCount = await InterestCategory.countDocuments({});
  console.log(`Found ${existingCount} existing categories in database\n`);

  const results = {
    uploaded: [],
    created: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  // Process each file
  console.log('Processing icons...\n');
  let order = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const filePath = path.join(ICONS_DIR, file);
    const categoryName = getCategoryNameFromFilename(file);

    // Skip duplicate files (like Sports-1.png)
    if (categoryName === null) {
      console.log(`Skipping duplicate: ${file}\n`);
      results.skipped.push({ file, reason: 'duplicate' });
      // eslint-disable-next-line no-continue
      continue;
    }

    console.log(`Processing: ${file}`);

    try {
      // Upload to S3
      const cloudFrontUrl = await uploadToS3(filePath, file);
      results.uploaded.push({ file, url: cloudFrontUrl });

      // Create or update category
      const { category, created } = await createOrUpdateCategory(categoryName, cloudFrontUrl, order);
      order += 1;

      if (created) {
        console.log(`  ✓ Created category: "${category.name}"\n`);
        results.created.push({ name: category.name, icon: cloudFrontUrl });
      } else {
        console.log(`  ✓ Updated category: "${category.name}"\n`);
        results.updated.push({ name: category.name, icon: cloudFrontUrl });
      }
    } catch (error) {
      console.error(`  ✗ Error processing ${file}: ${error.message}\n`);
      results.errors.push({ file, error: error.message });
    }
  }

  // Print summary
  console.log('\n===========================================');
  console.log('SUMMARY');
  console.log('===========================================');
  console.log(`✓ Uploaded: ${results.uploaded.length} files`);
  console.log(`✓ Created: ${results.created.length} categories`);
  console.log(`✓ Updated: ${results.updated.length} categories`);

  if (results.skipped.length > 0) {
    console.log(`\n⚠ Skipped (${results.skipped.length}):`);
    results.skipped.forEach((item) => {
      console.log(`  - ${item.file} (${item.reason})`);
    });
  }

  if (results.errors.length > 0) {
    console.log(`\n✗ Errors (${results.errors.length}):`);
    results.errors.forEach((item) => {
      console.log(`  - ${item.file}: ${item.error}`);
    });
  }

  // List all categories and their icon status
  console.log('\n===========================================');
  console.log('CATEGORY ICON STATUS');
  console.log('===========================================');
  const updatedCategories = await InterestCategory.find({}).sort({ order: 1 });
  updatedCategories.forEach((cat) => {
    const iconStatus = cat.icon ? '✓' : '✗';
    console.log(`${iconStatus} ${cat.name}: ${cat.icon || 'No icon'}`);
  });

  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('\n✓ Disconnected from MongoDB');
  console.log('\nScript completed!');
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
