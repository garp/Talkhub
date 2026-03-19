const mongoose = require('mongoose');

exports.ObjectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid', { message: 'Invalid ObjectID format' });
  }
  return value;
};

exports.patternError = (errorMessage) => ({
  'string.pattern.base': errorMessage || 'Invalid input. Please provide a valid input.',
});

exports.uriOptions = {
  scheme: ['http', 'https'],
  allowRelative: true,
  allowQuerySquareBrackets: true,
};
