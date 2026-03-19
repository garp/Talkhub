const jwt = require('jsonwebtoken');
const { errorHandler } = require('../helpers/responseHandler');
const { logError, logInfo } = require('../helpers/logger');
const env = require('../configs/env.config');
const User = require('../../src/models/user.model');

exports.verifyToken = async (req, res, next) => {
  let token = req.headers.authorization;

  if (!token) {
    return errorHandler('ERR-003', res);
  }

  try {
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    // Check tokenVersion to ensure token hasn't been invalidated (force logout)
    const user = await User.findById(decoded.userId).select('tokenVersion').lean();
    if (!user) {
      return errorHandler('ERR-003', res);
    }

    // If tokenVersion in JWT doesn't match current user's tokenVersion, token is invalidated
    const tokenVersionInJwt = decoded.tokenVersion ?? 0;
    const currentTokenVersion = user.tokenVersion ?? 0;
    if (tokenVersionInJwt !== currentTokenVersion) {
      logInfo(`Token invalidated for user ${decoded.userId}: token version mismatch (jwt: ${tokenVersionInJwt}, current: ${currentTokenVersion})`);
      return errorHandler('ERR-003', res);
    }

    req.user = decoded;
    logInfo(`user ${req.user.userId}`);

    return next();
  } catch (error) {
    return errorHandler('ERR-003', res);
  }
};

exports.verifySocketToken = async (socket, next) => {
  let { token } = socket.handshake.query;

  if (!token) {
    logError('No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    // Check tokenVersion to ensure token hasn't been invalidated (force logout)
    const user = await User.findById(decoded.userId).select('tokenVersion').lean();
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    // If tokenVersion in JWT doesn't match current user's tokenVersion, token is invalidated
    const tokenVersionInJwt = decoded.tokenVersion ?? 0;
    const currentTokenVersion = user.tokenVersion ?? 0;
    if (tokenVersionInJwt !== currentTokenVersion) {
      logError(`Token invalidated for user ${decoded.userId}: token version mismatch`);
      return next(new Error('Authentication error: Token has been revoked'));
    }

    /* eslint-disable no-param-reassign */
    socket.handshake.query.userId = decoded.userId;
    // Also set userId directly on socket for easier access in event handlers
    socket.userId = decoded.userId;
    /* eslint-enable no-param-reassign */
    return next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
};
