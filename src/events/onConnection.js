const { socketEvents } = require('../../lib/constants/socket');
const userServices = require('../services/userServices');

exports.onConnection = async (socket) => {
  try {
    const { userId } = socket.handshake.query;
    // eslint-disable-next-line no-console
    console.log(`User ${userId} connected via socket ID: ${socket.id}`);
    const user = await userServices.findByIdAndUpdate({ id: userId, body: { onlineStatus: true } });
    // await redisService.setUserData(userId);
    socket.emit(socketEvents.PAIR_SUCCESS, {
      message: 'Successfully connected to the socket.',
      onlineStatus: user.onlineStatus,
    });
    socket.join(userId);
  } catch (error) {
    socket.emit(socketEvents.PAIR_FAILED, {
      message: error.message,
    });
    throw Error(error);
  }
};

exports.onDisconnect = async (socket) => {
  try {
    const { userId } = socket.handshake.query;
    // eslint-disable-next-line no-console
    console.log(`User ${userId} connected via socket ID: ${socket.id}`);
    await userServices.findOneAndUpdate({ id: userId, body: { onlineStatus: false } });
  } catch (error) {
    throw Error(error);
  }
};
