const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { reportGroup } = require('../controllers/report.controller');
const { reportGroupSchema } = require('../validators/report.validators');

router.route('/').post(
  validateRequest(reportGroupSchema, 'body'),
  verifyToken,
  reportGroup,
);

module.exports = router;
