const { errorCodes } = require('../constants/errorCodes');
const { transformUrls } = require('./cloudfront');

module.exports.responseHandler = (data, res, httpStatus = 200) => {
  // Transform S3 URLs to CloudFront URLs before sending
  const transformedData = transformUrls(data);

  res.status(httpStatus).json({
    data: transformedData,
  });
};

module.exports.errorHandler = (errorCode, res) => {
  const { httpStatus, message } = errorCodes[errorCode];
  res.status(httpStatus).json({
    code: errorCode,
    message,
  });
};
