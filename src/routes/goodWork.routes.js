const express = require('express');

const router = express.Router();
const { goodWorkHimanshu } = require('../controllers/goodWork.controller');

router.get('/', goodWorkHimanshu);

module.exports = router;
