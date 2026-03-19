const router = require('express').Router();
const {
  createFavouriteSchema,
  getFavouritesQuerySchema,
  deleteFavouriteParamsSchema,
} = require('../validators/favourite.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  createFavourite,
  getFavourites,
  deleteFavourite,
  checkFavourite,
} = require('../controllers/favourite.controller');

router.route('/')
  .post(
    verifyToken,
    validateRequest(createFavouriteSchema, 'body'),
    createFavourite,
  )
  .get(
    verifyToken,
    validateRequest(getFavouritesQuerySchema, 'query'),
    getFavourites,
  );

router.route('/check/:placeId')
  .get(
    verifyToken,
    validateRequest(deleteFavouriteParamsSchema, 'params'),
    checkFavourite,
  );

router.route('/:placeId')
  .delete(
    verifyToken,
    validateRequest(deleteFavouriteParamsSchema, 'params'),
    deleteFavourite,
  );

module.exports = router;
