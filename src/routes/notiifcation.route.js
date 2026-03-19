const router = require('express').Router();
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');

const {
  getAllNotifications,
  markNotificationRead,
  markNotificationsRead,
  getUnreadNotificationCount,
} = require('../controllers/notification.controller');
const {
  listNotificationsQuerySchema,
  markNotificationReadParamsSchema,
  markNotificationsReadBodySchema,
  getUnreadCountQuerySchema,
} = require('../validators/notification.validators');

// Get all notifications (paginated)
router.get('/', verifyToken, validateRequest(listNotificationsQuerySchema, 'query'), getAllNotifications);

// Get unread notification count
router.get('/unread-count', verifyToken, validateRequest(getUnreadCountQuerySchema, 'query'), getUnreadNotificationCount);

// Mark single notification as read
router.patch('/:notificationId/read', verifyToken, validateRequest(markNotificationReadParamsSchema, 'params'), markNotificationRead);

// Mark multiple notifications as read (bulk operation)
router.post('/mark-read', verifyToken, validateRequest(markNotificationsReadBodySchema, 'body'), markNotificationsRead);

module.exports = router;
