const { Router } = require('express');
const {
  create,
  getStory,
  getStoryById,
  getStoriesFeed,
  viewStory,
  getStoryViewers,
  reactToStory,
  likeStory,
  addToHighlight,
  getHighlightedStories,
  removeFromHighlight,
  removeStoryFromCollection,
  deleteStory,
  muteUserStories,
  unmuteUserStories,
  notifyUserStories,
  unnotifyUserStories,
} = require('../controllers/stories.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { upload } = require('../../lib/middlewares/mediaUpload.middleware');
const {
  validateCreateStory,
  validateStoriesFeed,
  validateStoryIdParam,
  validateStoryViewersQuery,
  validateStoryReactionBody,
  validateAddToHighlight,
  validateAddToHighlightBody,
  validateRemoveFromHighlight,
  validateRemoveStoryFromCollection,
  validateDeleteStory,
  validateStoryMuteBody,
  validateStoryNotifyBody,
} = require('../validators/stories.validators');

const router = Router();

// Create a new story
router.post(
  '/',
  verifyToken,
  upload.single('storyFile'),
  validateCreateStory,
  create,
);

// Stories feed (Instagram-like)
router.get('/feed', verifyToken, validateStoriesFeed, getStoriesFeed);

// Story mute/notify preferences (must be before /:storyId param routes)
router.post('/muteUserStories', verifyToken, validateStoryMuteBody, muteUserStories);
router.post('/unmuteUserStories', verifyToken, validateStoryMuteBody, unmuteUserStories);
router.post('/notifyUserStories', verifyToken, validateStoryNotifyBody, notifyUserStories);
router.post('/unnotifyUserStories', verifyToken, validateStoryNotifyBody, unnotifyUserStories);

// Get current user's stories
router.get('/', verifyToken, getStory);

// Get highlighted stories (must be before /:storyId param route)
router.get('/highlights', verifyToken, getHighlightedStories);

// Get a single story by ID (for shared stories in DMs)
router.get('/:storyId', verifyToken, validateStoryIdParam, getStoryById);

// Record a view (idempotent)
router.post('/:storyId/view', verifyToken, validateStoryIdParam, viewStory);

// Get story viewers (owner-only)
router.get('/:storyId/viewers', verifyToken, validateStoryIdParam, validateStoryViewersQuery, getStoryViewers);

// React to story (emoji)
router.post('/:storyId/reaction', verifyToken, validateStoryIdParam, validateStoryReactionBody, reactToStory);

// Like / unlike a story (toggle)
router.post('/:storyId/like', verifyToken, validateStoryIdParam, likeStory);

// Add a story to highlights
router.patch('/:storyId/highlight', verifyToken, validateAddToHighlight, validateAddToHighlightBody, addToHighlight);

// Remove a story from highlights (completely)
router.delete('/:storyId/highlight', verifyToken, validateRemoveFromHighlight, removeFromHighlight);

// Remove a story from a specific collection
router.delete('/collection/:collectionId/story/:storyId', verifyToken, validateRemoveStoryFromCollection, removeStoryFromCollection);

// Delete a story (soft delete)
router.delete('/:storyId', verifyToken, validateDeleteStory, deleteStory);

module.exports = router;
