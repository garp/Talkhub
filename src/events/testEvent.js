const { socketEvents } = require('../../lib/constants/socket');

exports.test = (socket) => {
  socket.on(socketEvents.TEST, ({ name }) => {
    const responseMessage = `Hii there, Its ${name}! 🚀`;
    socket.emit(socketEvents.TEST, responseMessage);
  });
};
