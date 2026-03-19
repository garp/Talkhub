const { MongoError } = require('mongodb'); // Import mongodb first
const { errorHandler } = require('./responseHandler');
const { logError } = require('./logger');
const { errorCodes } = require('../constants/errorCodes');
const dal = require('../dal/dal');
const { NODE_ENV } = require('../configs/server.config');

exports.asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
    return undefined;
  } catch (error) {
    if (NODE_ENV === 'dev') logError(error);
    logError(
      `${(req.user && req.user.id) || 'common'} - ${error.message} - ${errorCodes[error.message] ? errorCodes[error.message].message : 'Unknown Error'
      }`,
    );
    if (error instanceof MongoError && error.code === 11000) {
      return errorHandler('ERR-101', res);
    }
    if (errorCodes[error.message]) return errorHandler(error.message, res);

    // Return actual error details instead of generic server error
    const { httpStatus, message } = errorCodes['ERR-004'];
    res.status(httpStatus).json({
      code: 'ERR-004',
      message,
      error: NODE_ENV === 'dev' ? error.message : undefined,
      stack: NODE_ENV === 'dev' ? error.stack : undefined,
    });
    return undefined;
  }
};

exports.transactionHandler = (fn) => async (req, res, next) => {
  const session = await dal.startTransaction();
  try {
    await fn(req, res, next, session);
    await dal.commitTransaction(session);
    return undefined;
  } catch (error) {
    if (NODE_ENV === 'dev') logError(error); // Use logError instead of console.log
    await dal.abortTransaction(session);
    logError(
      `${(req.user && req.user.id) || 'common'} - ${error.message} - ${errorCodes[error.message] ? errorCodes[error.message].message : 'Unknown Error'
      }`,
    );
    if (error instanceof MongoError && error.code === 11000) {
      return errorHandler('ERR-101', res);
    }
    if (errorCodes[error.message]) return errorHandler(error.message, res);

    // Return actual error details instead of generic server error
    const { httpStatus, message } = errorCodes['ERR-004'];
    res.status(httpStatus).json({
      code: 'ERR-004',
      message,
      error: NODE_ENV === 'dev' ? error.message : undefined,
      stack: NODE_ENV === 'dev' ? error.stack : undefined,
    });
    return undefined;
  }
};
