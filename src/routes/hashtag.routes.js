const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const {
  createHashtagSchema,
  updateHashtagSchema,
  findOneHashtagSchema,
  findOneHashtagQuerySchema,
  searchSchema,
  findHashtagsByRadiusSchema,
  paginationSchema,
  saveHashtagSchema,
  removeSavedHashtagSchema,
  pinHashtagParamsSchema,
  notInterestedHashtagSchema,
  notInterestedHashtagParamsSchema,
  deleteHashtagSchema,
  createSubHashtagSchema,
  updateSubHashtagSchema,
  findHashtagUsersQuerySchema,
  acceptHashtagPolicyParamsSchema,
  removeHashtagFromChatListParamsSchema,
  broadcastListQuerySchema,
  inviteHashtagParamsSchema,
  inviteHashtagBodySchema,
  requestIdParamsSchema,
  respondHashtagRequestBodySchema,
  assignHashtagRoleParamsSchema,
  assignHashtagRoleBodySchema,
  muteHashtagBodySchema,
  exitHashtagBodySchema,
  inviteActivityQuerySchema,
} = require('../validators/hashtag.validators');
const {
  createHashtag,
  updateHashtag,
  findOneHashtag,
  findHashtagUsers,
  findHashtagsByRadius,
  search,
  getAllHashtags,
  trendingChatsList,
  saveHashtag,
  removeSavedHashtag,
  getSavedHashtags,
  pinHashtag,
  unpinHashtag,
  markHashtagNotInterested,
  undoHashtagNotInterested,
  deleteHashtag,
  createSubHashTag,
  getAllSubHashtags,
  updateSubHashTag,
  deleteSubHashtag,
  acceptHashtagPolicy,
  removeHashtagFromChatList,
  getBroadcastList,
  findHashtagUsersWithRoles,
  muteHashtagNotifications,
  unmuteHashtagNotifications,
  exitHashtagChatroom,
} = require('../controllers/hashtag.controller');
const {
  inviteToHashtag,
  listMyHashtagRequests,
  respondHashtagRequest,
  acceptHashtagRequest,
  rejectHashtagRequest,
  getHashtagInviteActivity,
} = require('../controllers/hashtagRequest.controller');
const { seedHashtagRoles, assignHashtagRole, getHashtagRoles } = require('../controllers/hashtagRole.controller');
const hashtagLikeRoutes = require('./hashtagLike.routes');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { updateWelcomePageSchema } = require('../validators/welcomePage.validator');
const { updateWelcomePage } = require('../controllers/welcomePage.controller');

router.route('/create-hashtag').post(verifyToken, validateRequest(createHashtagSchema, 'body'), createHashtag);
router.route('/update-hashtag/:hashtagId').put(verifyToken, validateRequest(updateHashtagSchema, 'body'), updateHashtag);
router.route('/find-one-hashtag/:hashtagId').get(
  verifyToken,
  validateRequest(findOneHashtagSchema, 'params'),
  validateRequest(findOneHashtagQuerySchema, 'query'),
  findOneHashtag,
);
router.route('/find-one-user/:hashtagId').get(
  verifyToken,
  validateRequest(findOneHashtagSchema, 'params'),
  validateRequest(findHashtagUsersQuerySchema, 'query'),
  findHashtagUsers,
);
router.route('/find-one-user/:hashtagId/with-roles').get(
  verifyToken,
  validateRequest(findOneHashtagSchema, 'params'),
  validateRequest(findHashtagUsersQuerySchema, 'query'),
  findHashtagUsersWithRoles,
);
router.route('/find-hashtags-by-radius').get(verifyToken, validateRequest(findHashtagsByRadiusSchema, 'query'), findHashtagsByRadius);
router.route('/').get(verifyToken, validateRequest(searchSchema, 'query'), search);
router.route('/getAllHashtags').get(verifyToken, validateRequest(paginationSchema, 'params'), getAllHashtags);
router.route('/trendingChatList').get(verifyToken, validateRequest(paginationSchema, 'params'), trendingChatsList);
router.route('/broadcast-list').get(verifyToken, validateRequest(broadcastListQuerySchema, 'query'), getBroadcastList);

// Hashtag invite / request flow
router.route('/:hashtagId/requests/invite').post(
  verifyToken,
  validateRequest(inviteHashtagParamsSchema, 'params'),
  validateRequest(inviteHashtagBodySchema, 'body'),
  inviteToHashtag,
);
router.route('/requests').get(verifyToken, listMyHashtagRequests);
// New unified respond endpoint (preferred)
router.route('/requests/:requestId').put(
  verifyToken,
  validateRequest(requestIdParamsSchema, 'params'),
  validateRequest(respondHashtagRequestBodySchema, 'body'),
  respondHashtagRequest,
);

// Backward-compatible aliases
router.route('/requests/:requestId/accept').post(verifyToken, validateRequest(requestIdParamsSchema, 'params'), acceptHashtagRequest);
router.route('/requests/:requestId/reject').post(verifyToken, validateRequest(requestIdParamsSchema, 'params'), rejectHashtagRequest);

// Invite activity log (shows invite flow as sentences)
router.route('/:hashtagId/invite-activity').get(
  verifyToken,
  validateRequest(findOneHashtagSchema, 'params'),
  validateRequest(inviteActivityQuerySchema, 'query'),
  getHashtagInviteActivity,
);

router.route('/save').post(verifyToken, validateRequest(saveHashtagSchema, 'body'), saveHashtag);
router.route('/save/:hashtagId').delete(verifyToken, validateRequest(removeSavedHashtagSchema, 'params'), removeSavedHashtag);
router.route('/save').get(verifyToken, getSavedHashtags);

// Pin/unpin hashtag (alias of save/unsave) to match private-chatroom APIs
router.route('/:hashtagId/pin').post(verifyToken, validateRequest(pinHashtagParamsSchema, 'params'), pinHashtag);
router.route('/:hashtagId/unpin').post(verifyToken, validateRequest(pinHashtagParamsSchema, 'params'), unpinHashtag);

// Mute/unmute hashtag notifications (per user)
router.route('/:hashtagId/mute').post(
  verifyToken,
  validateRequest(pinHashtagParamsSchema, 'params'),
  validateRequest(muteHashtagBodySchema, 'body'),
  muteHashtagNotifications,
);
router.route('/:hashtagId/unmute').post(
  verifyToken,
  validateRequest(pinHashtagParamsSchema, 'params'),
  unmuteHashtagNotifications,
);

// Exit hashtag chatroom (leave)
router.route('/:hashtagId/exit').post(
  verifyToken,
  validateRequest(pinHashtagParamsSchema, 'params'),
  validateRequest(exitHashtagBodySchema, 'body'),
  exitHashtagChatroom,
);

// Hashtag policy acceptance (per user)
router.route('/:hashtagId/policy/accept').post(
  verifyToken,
  validateRequest(acceptHashtagPolicyParamsSchema, 'params'),
  acceptHashtagPolicy,
);

// Remove hashtag from chat list for this user (does not delete hashtag/messages)
router.route('/:hashtagId/remove').delete(
  verifyToken,
  validateRequest(removeHashtagFromChatListParamsSchema, 'params'),
  removeHashtagFromChatList,
);

router.route('/not-interested').post(verifyToken, validateRequest(notInterestedHashtagSchema, 'body'), markHashtagNotInterested);
router.route('/not-interested/:hashtagId').delete(verifyToken, validateRequest(notInterestedHashtagParamsSchema, 'params'), undoHashtagNotInterested);
router.route('/:hashtagId').delete(verifyToken, validateRequest(deleteHashtagSchema, 'params'), deleteHashtag);
router.use('/like', hashtagLikeRoutes);

router.route('/rules').put(verifyToken, validateRequest(updateWelcomePageSchema, 'body'), updateWelcomePage);

// RBAC: seed role definitions (GOD only) and assign roles (GOD only for now)
router.route('/roles/seed').post(verifyToken, seedHashtagRoles);
router.route('/roles').get(verifyToken, getHashtagRoles);
router.route('/:hashtagId/roles/assign').post(
  verifyToken,
  validateRequest(assignHashtagRoleParamsSchema, 'params'),
  validateRequest(assignHashtagRoleBodySchema, 'body'),
  assignHashtagRole,
);
router.route('/create-subhashtag').post(verifyToken, validateRequest(createSubHashtagSchema, 'body'), createSubHashTag);
router.route('/get-subhashtags').get(verifyToken, getAllSubHashtags);
router.route('/update-subhashtag/:id').put(verifyToken, validateRequest(updateSubHashtagSchema, 'body'), updateSubHashTag);
router.route('/delete-subhashtag/:id').delete(verifyToken, deleteSubHashtag);

module.exports = router;
