const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const {
  viewSchema,
  joinSchema,
  clearMessagesSchema,
  deleteHashtagChatsSchema,
  searchHashtagChitsQuerySchema,
  sendHashtagPollSchema,
  voteHashtagPollSchema,
} = require('../validators/chatroom.validators');
const {
  view,
  join,
  clearMessages,
  deleteHashtagChats,
  searchHashtagChits,
  sendHashtagPoll,
  voteHashtagPoll,
} = require('../controllers/chatroom.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/view/:hashtagId').get(verifyToken, validateRequest(viewSchema, 'params'), view);
router.route('/join/:hashtagId').get(verifyToken, validateRequest(joinSchema, 'params'), join);
router.route('/:hashtagId/clear-messages').post(verifyToken, validateRequest(clearMessagesSchema, 'params'), clearMessages);
router.route('/delete').post(verifyToken, validateRequest(deleteHashtagChatsSchema, 'body'), deleteHashtagChats);
router.route('/search-chits').get(verifyToken, validateRequest(searchHashtagChitsQuerySchema, 'query'), searchHashtagChits);
// Poll REST endpoints (useful for curl/postman testing; sockets remain the primary API)
router.route('/poll/send').post(verifyToken, validateRequest(sendHashtagPollSchema, 'body'), sendHashtagPoll);
router.route('/poll/vote').post(verifyToken, validateRequest(voteHashtagPollSchema, 'body'), voteHashtagPoll);

module.exports = router;
