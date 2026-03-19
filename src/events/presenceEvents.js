const { socketEvents } = require('../../lib/constants/socket');
const userServices = require('../services/userServices');
const redisService = require('../services/redisService');

const HEARTBEAT_STALE_THRESHOLD_MS = 10 * 1000; // 10 seconds

const emitError = (socket, message) => {
  socket.emit(socketEvents.ERROR, { message });
};

exports.handleHeartbeat = async (socket, payload = {}) => {
  try {
    const { userId } = socket.handshake.query;
    if (!userId) {
      emitError(socket, 'Unable to identify user for heartbeat.');
      return;
    }

    const timestamp = Number(payload.timestamp) || Date.now();

    await redisService.saveHeartbeat({ userId, timestamp });
    await userServices.findByIdAndUpdate({
      id: userId,
      body: { lastActive: new Date(timestamp), onlineStatus: true },
    });

    socket.emit(socketEvents.HEARTBEAT_ACK, {
      userId,
      timestamp,
    });
  } catch (error) {
    console.log('handleHeartbeat error ===>', error);
    emitError(socket, error.message || 'Unable to process heartbeat.');
  }
};

exports.handleUserStatus = async (socket, payload = {}) => {
  try {
    const { userId: targetUserId } = payload;
    if (!targetUserId) {
      emitError(socket, 'Target userId is required.');
      return;
    }

    const heartbeat = await redisService.getHeartbeat(targetUserId);
    const now = Date.now();

    if (!heartbeat) {
      const user = await userServices.findById({ id: targetUserId });
      const lastActiveTimestamp = user && user.lastActive
        ? new Date(user.lastActive).getTime()
        : null;
      socket.emit(socketEvents.USER_STATUS_RESULT, {
        userId: targetUserId,
        isActive: false,
        lastActive: lastActiveTimestamp,
      });
      return;
    }

    const heartbeatTimestamp = Number(heartbeat.timestamp);
    const isTimestampValid = Number.isFinite(heartbeatTimestamp);
    const isActive = Number.isFinite(heartbeatTimestamp)
      ? now - heartbeatTimestamp <= HEARTBEAT_STALE_THRESHOLD_MS
      : false;

    socket.emit(socketEvents.USER_STATUS_RESULT, {
      userId: targetUserId,
      isActive,
      lastActive: isTimestampValid ? heartbeatTimestamp : null,
    });
  } catch (error) {
    emitError(socket, error.message || 'Unable to fetch user status.');
  }
};
