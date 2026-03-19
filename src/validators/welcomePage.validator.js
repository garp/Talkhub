const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.updateWelcomePageSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
  title: Joi.string().min(3).max(50),
  description: Joi.string().min(3).max(55),
  rules: Joi.array().items(Joi.string()).unique(),
  language: Joi.string(),
  ageRange: Joi.string().valid('All', '7+', '12+', '16+', '18+'),
  fullLocation: Joi.string(),
  coordinates: Joi.array().items(Joi.number()).length(2),
}).with('coordinates', 'fullLocation')
  .with('fullLocation', 'coordinates');
