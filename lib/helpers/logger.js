const { createLogger, transports, format } = require('winston');

const logConfiguration = {
  transports: [
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: format.combine(format.timestamp(), format.json()),
    }),
    new transports.Console({
      level: 'info',
      format: format.combine(format.colorize(), format.simple()),
    }),
  ],
};
const logger = createLogger(logConfiguration);
exports.logInfo = (message) => {
  logger.info(message);
};
exports.logError = (message) => {
  logger.error(message);
};
exports.logWarn = (message) => {
  logger.warn(message);
};
exports.logDebug = (message) => {
  logger.debug(message);
};
