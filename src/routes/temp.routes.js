const express = require('express');

const router = express.Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { getOtpByPhoneQuerySchema } = require('../validators/temp.validators');
const { getOtpByPhone } = require('../controllers/temp.controller');

router.get('/get-otp', validateRequest(getOtpByPhoneQuerySchema, 'query'), getOtpByPhone);

module.exports = router;
