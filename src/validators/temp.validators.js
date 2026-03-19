const Joi = require('joi');

exports.getOtpByPhoneQuerySchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\d{5,20}$/)
    .required(),
});
