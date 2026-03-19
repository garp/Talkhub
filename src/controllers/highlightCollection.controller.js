const { Types } = require('mongoose');
const highlightCollectionServices = require('../services/highlightCollectionServices');
const storiesServices = require('../services/storiesServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');

const { ObjectId } = Types;

// Create a new highlight collection
exports.createCollection = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { name, coverUrl, coverStoryId } = req.body;

  // Validate coverStoryId if provided
  if (coverStoryId) {
    const story = await storiesServices.findById({ id: coverStoryId });
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Cover story not found',
      });
    }
    if (story.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only use your own stories as cover',
      });
    }
  }

  const collectionData = {
    userId,
    name,
    coverUrl: coverUrl || '',
    ...(coverStoryId && { coverStoryId }),
  };

  const collection = await highlightCollectionServices.create(collectionData);
  return responseHandler({ collection }, res);
});

// Get all highlight collections for logged-in user
exports.getMyCollections = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const collections = await highlightCollectionServices.find({
    filter: { userId: new ObjectId(userId) },
    sort: { createdAt: -1 },
  });

  return responseHandler({ collections }, res);
});

// Get a specific collection with its stories
exports.getCollection = asyncHandler(async (req, res) => {
  const { collectionId } = req.params;

  const collection = await highlightCollectionServices.findById({ id: collectionId });

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found',
    });
  }

  // Get all stories in this collection
  const stories = await storiesServices.find({
    filter: {
      isHighlight: true,
      highlightCollectionId: new ObjectId(collectionId),
    },
    sort: { createdAt: -1 },
  });

  return responseHandler({ collection, stories }, res);
});

// Update a highlight collection
exports.updateCollection = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { collectionId } = req.params;
  const { name, coverUrl, coverStoryId } = req.body;

  // Check if collection exists and belongs to user
  const collection = await highlightCollectionServices.findById({ id: collectionId });

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found',
    });
  }

  if (collection.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to update this collection',
    });
  }

  // Validate coverStoryId if provided
  if (coverStoryId) {
    const story = await storiesServices.findById({ id: coverStoryId });
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Cover story not found',
      });
    }
    if (story.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only use your own stories as cover',
      });
    }
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (coverUrl !== undefined) updateData.coverUrl = coverUrl;
  if (coverStoryId !== undefined) updateData.coverStoryId = coverStoryId;

  const updatedCollection = await highlightCollectionServices.findByIdAndUpdate({
    id: collectionId,
    body: updateData,
  });

  return responseHandler({ collection: updatedCollection }, res);
});

// Delete a highlight collection
exports.deleteCollection = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { collectionId } = req.params;

  // Check if collection exists and belongs to user
  const collection = await highlightCollectionServices.findById({ id: collectionId });

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found',
    });
  }

  if (collection.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete this collection',
    });
  }

  // Remove the highlightCollectionId from all stories in this collection
  await storiesServices.findOneAndUpdate({
    filter: { highlightCollectionId: new ObjectId(collectionId) },
    body: {
      $unset: { highlightCollectionId: 1 },
      isHighlight: false,
    },
  });

  // Delete the collection
  await highlightCollectionServices.findByIdAndDelete({ id: collectionId });

  return responseHandler({
    message: 'Collection deleted successfully',
  }, res);
});
