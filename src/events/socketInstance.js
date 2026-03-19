let ioInstance = null;

/**
 * Store socket.io server instance for use outside socket event handlers.
 * This lets services (e.g. notification creation) emit real-time events.
 */
exports.setIO = (io) => {
  ioInstance = io || null;
};

exports.getIO = () => ioInstance;
