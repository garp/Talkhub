const router = require('express').Router();
const { getRecentChatList } = require('../controllers/userInteraction.controller');

const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/get-recent-chat-list').get(verifyToken, getRecentChatList);
module.exports = router;
