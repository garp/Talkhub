const Joi = require('joi');

exports.listPeopleQuerySchema = Joi.object({
  page: Joi.number().integer().min(1)
    .default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
  search: Joi.string().trim().min(1).max(100)
    .optional()
    .allow('', null),
});
