const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

const { getPeople } = require('../controllers/people.controller');
const { listPeopleQuerySchema } = require('../validators/people.validators');

router.get('/', verifyToken, validateRequest(listPeopleQuerySchema, 'query'), getPeople);

module.exports = router;
