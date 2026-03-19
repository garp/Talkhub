const otpServices = require('../services/otpServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');

exports.getOtpByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.value;

  const otp = await otpServices.findOne({
    filter: { phone, mode: 'phone' },
    projection: {
      _id: 1,
      phone: 1,
      countryCode: 1,
      code: 1,
      identifierCode: 1,
      purpose: 1,
      mode: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    sort: { updatedAt: -1 },
  });

  if (!otp) {
    return errorHandler('ERR-109', res);
  }

  return responseHandler(
    {
      _id: otp._id,
      phone: otp.phone,
      countryCode: otp.countryCode || null,
      code: otp.code,
      identifierCode: otp.identifierCode,
      purpose: otp.purpose,
      mode: otp.mode,
      createdAt: otp.createdAt,
      updatedAt: otp.updatedAt,
    },
    res,
  );
});
