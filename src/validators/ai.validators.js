const Joi = require('joi');

/**
 * Schema for AI image generation request
 */
exports.generateImageSchema = Joi.object({
  prompt: Joi.string()
    .required()
    .min(1)
    .max(4000)
    .trim()
    .messages({
      'any.required': 'Prompt is required',
      'string.empty': 'Prompt cannot be empty',
      'string.min': 'Prompt must be at least 1 character',
      'string.max': 'Prompt must be 4000 characters or less',
    }),
  size: Joi.string()
    .valid('1024x1024', '1024x1792', '1792x1024')
    .default('1024x1024')
    .messages({
      'any.only': 'Size must be one of: 1024x1024, 1024x1792, 1792x1024',
    }),
  quality: Joi.string()
    .valid('standard', 'hd')
    .default('standard')
    .messages({
      'any.only': 'Quality must be either "standard" or "hd"',
    }),
  style: Joi.string()
    .valid('vivid', 'natural')
    .default('vivid')
    .messages({
      'any.only': 'Style must be either "vivid" or "natural"',
    }),
});
