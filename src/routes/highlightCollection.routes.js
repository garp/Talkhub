const { Router } = require('express');
const {
  createCollection,
  getMyCollections,
  getCollection,
  updateCollection,
  deleteCollection,
} = require('../controllers/highlightCollection.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  validateCreateCollection,
  validateUpdateCollection,
  validateUpdateCollectionBody,
  validateDeleteCollection,
  validateGetCollection,
} = require('../validators/highlightCollection.validators');

const router = Router();

// Create a new highlight collection
router.post(
  '/',
  verifyToken,
  validateCreateCollection,
  createCollection,
);

// Get all collections for logged-in user
router.get('/', verifyToken, getMyCollections);

// Get a specific collection with its stories
router.get('/:collectionId', verifyToken, validateGetCollection, getCollection);

// Update a highlight collection
router.put(
  '/:collectionId',
  verifyToken,
  validateUpdateCollection,
  validateUpdateCollectionBody,
  updateCollection,
);

// Delete a highlight collection
router.delete('/:collectionId', verifyToken, validateDeleteCollection, deleteCollection);

module.exports = router;
