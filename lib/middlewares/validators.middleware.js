const { responseHandler, errorHandler } = require('../helpers/responseHandler');
const { logError } = require('../helpers/logger');

const defaults = {
  abortEarly: false, // include all errors
  allowUnknown: true, // ignore unknown props
  stripUnknown: true, // remove unknown props
};

const formatValidationMessage = (rawMessage) => {
  if (!rawMessage || typeof rawMessage !== 'string') return 'Validation error';

  // Remove all double quotes (e.g. "fullLocation" -> fullLocation)
  let msg = rawMessage.replace(/"/g, '');

  // Trim leading/trailing whitespace
  msg = msg.trim();

  if (!msg) return 'Validation error';

  // Capitalize first character
  return msg.charAt(0).toUpperCase() + msg.slice(1);
};

exports.validateRequest = (schema, source) => (req, res, next) => {
  if (!source || (source !== 'body' && source !== 'query' && source !== 'params')) return errorHandler('ERR-004', res);
  const { error, value } = schema.validate(req[source], defaults);
  if (error) {
    const rawMessage = error.details[0].message;
    const formattedMessage = formatValidationMessage(rawMessage);
    logError(formattedMessage);
    return responseHandler(formattedMessage, res, 400);
    // return errorHandler("ERR-001", res);
  }
  // Merge validated parts across multiple validateRequest calls (params + query + body)
  // so later validations don't clobber earlier validated values.
  req.value = { ...(req.value || {}), ...(value || {}) };
  next();
  return undefined;
};
