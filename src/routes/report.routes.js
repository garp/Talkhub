const router = require('express').Router();

const { validateRequest } = require('../../lib/middlewares/validators.middleware');

const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { reportUser, getAllReports, actionReport } = require('../controllers/report.controller');
const { reportUserSchema, getReportSchema, actionReportSchema } = require('../validators/report.validators');

router.route('/').post(validateRequest(reportUserSchema, 'body'), verifyToken, reportUser);
router.route('/').get(validateRequest(getReportSchema, 'query'), verifyToken, getAllReports);
router.route('/actionReport').put(validateRequest(actionReportSchema, 'body'), verifyToken, actionReport);
module.exports = router;
