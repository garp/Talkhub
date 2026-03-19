const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const {
  createListSchema,
  updateListSchema,
  listIdParamsSchema,
  getListQuerySchema,
} = require('../validators/list.validators');
const {
  createList,
  updateList,
  deleteList,
  getAllLists,
  getListChatrooms,
} = require('../controllers/list.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/').post(verifyToken, validateRequest(createListSchema, 'body'), createList);
router.route('/').get(
  verifyToken,
  // Optional: allow fetching a single list by ?id=... (or ?listId=...)
  validateRequest(getListQuerySchema, 'query'),
  getAllLists,
);
router.route('/:listId').put(
  verifyToken,
  validateRequest(listIdParamsSchema, 'params'),
  validateRequest(updateListSchema, 'body'),
  updateList,
);
router.route('/:listId').delete(verifyToken, validateRequest(listIdParamsSchema, 'params'), deleteList);
router.route('/:listId/chatrooms').get(verifyToken, validateRequest(listIdParamsSchema, 'params'), getListChatrooms);

module.exports = router;
