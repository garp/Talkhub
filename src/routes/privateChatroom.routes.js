const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const {
  createPrivateGroupChatSchema,
  clearPrivateChatroomMessagesParamsSchema,
  pinPrivateChatroomParamsSchema,
  privateChatroomUsersQuerySchema,
  deletePrivateChatroomsSchema,
  sendPrivatePollSchema,
  votePrivatePollSchema,
  privateGroupAddParticipantsBodySchema,
  privateGroupRemoveParticipantsBodySchema,
  privateGroupAddAdminBodySchema,
  privateGroupRemoveAdminBodySchema,
  mutePrivateChatroomBodySchema,
  exitPrivateChatroomBodySchema,
  updatePrivateGroupChatDetailsBodySchema,
} = require('../validators/privateChatroom.validators');
const {
  getPrivateChatroomList,
  getPrivateGroupChatList,
  createPrivateGroupChat,
  clearPrivateChatroomMessages,
  pinPrivateChatroom,
  unpinPrivateChatroom,
  getPrivateGroupChatUsers,
  deletePrivateChatrooms,
  sendPrivatePoll,
  votePrivatePoll,
  addPrivateGroupParticipants,
  removePrivateGroupParticipants,
  addPrivateGroupAdmin,
  removePrivateGroupAdmin,
  mutePrivateChatroomNotifications,
  unmutePrivateChatroomNotifications,
  exitPrivateChatroom,
  updatePrivateGroupChatDetails,
  getPrivateChatroomInfo,
  getPrivateChatroomSharedMedia,
} = require('../controllers/privateChatroom.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const groupList = require('./list.routes');

router.route('/list').get(verifyToken, getPrivateChatroomList);
router.route('/group-chats').get(verifyToken, getPrivateGroupChatList);
router.route('/create-group').post(verifyToken, validateRequest(createPrivateGroupChatSchema, 'body'), createPrivateGroupChat);
router.route('/:chatroomId/clear-messages').post(
  verifyToken,
  validateRequest(clearPrivateChatroomMessagesParamsSchema, 'params'),
  clearPrivateChatroomMessages,
);
router.route('/:chatroomId/pin').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  pinPrivateChatroom,
);
router.route('/:chatroomId/unpin').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  unpinPrivateChatroom,
);
router.route('/:chatroomId/mute').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(mutePrivateChatroomBodySchema, 'body'),
  mutePrivateChatroomNotifications,
);
router.route('/:chatroomId/unmute').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  unmutePrivateChatroomNotifications,
);
router.route('/:chatroomId/exit').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(exitPrivateChatroomBodySchema, 'body'),
  exitPrivateChatroom,
);
router.route('/:chatroomId/details').put(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(updatePrivateGroupChatDetailsBodySchema, 'body'),
  updatePrivateGroupChatDetails,
);
router.route('/:chatroomId/info').get(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  getPrivateChatroomInfo,
);
router.route('/:chatroomId/shared-media').get(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  getPrivateChatroomSharedMedia,
);
router.route('/:chatroomId/users').get(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(privateChatroomUsersQuerySchema, 'query'),
  getPrivateGroupChatUsers,
);
router.route('/delete').post(
  verifyToken,
  validateRequest(deletePrivateChatroomsSchema, 'body'),
  deletePrivateChatrooms,
);

// Private GROUP management (REST helpers; sockets remain primary API)
router.route('/:chatroomId/participants/add').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(privateGroupAddParticipantsBodySchema, 'body'),
  addPrivateGroupParticipants,
);
router.route('/:chatroomId/participants/remove').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(privateGroupRemoveParticipantsBodySchema, 'body'),
  removePrivateGroupParticipants,
);
router.route('/:chatroomId/admins/add').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(privateGroupAddAdminBodySchema, 'body'),
  addPrivateGroupAdmin,
);
router.route('/:chatroomId/admins/remove').post(
  verifyToken,
  validateRequest(pinPrivateChatroomParamsSchema, 'params'),
  validateRequest(privateGroupRemoveAdminBodySchema, 'body'),
  removePrivateGroupAdmin,
);

// Poll REST endpoints (useful for curl/postman testing; sockets remain the primary API)
router.route('/poll/send').post(verifyToken, validateRequest(sendPrivatePollSchema, 'body'), sendPrivatePoll);
router.route('/poll/vote').post(verifyToken, validateRequest(votePrivatePollSchema, 'body'), votePrivatePoll);
router.use('/group-list', groupList);

module.exports = router;
