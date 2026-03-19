const bcrypt = require('bcryptjs');
const model = require('../models/user.model');
const otpService = require('./otpServices');
const emailService = require('./emailService');
const smsService = require('./smsService');
const env = require('../../lib/configs/env.config');
const { logInfo, logError } = require('../../lib/helpers/logger');
const dal = require('../../lib/dal/dal');
// MONGODB SERVICES -----------------------------------------------------------
exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });
// exports.findByIdLocation = async({})
exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.find = async ({
  filter = {},
  pagination = {},
  sort = {},
  projection = {},
  populate = null,
  session = null,
}) => dal.find(model, {
  filter, pagination, sort, projection, populate, session,
});

exports.findByIdAndUpdate = async ({ id, body, session = null }) => (
  dal.findByIdAndUpdate(model, { id, body, session })
);

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);
// exports.findOneAndUpsert = async ({filter, body, session = null}) =>
//     await dal.findOneAndUpsert(model,{ filter, body, session});

// OTP SERVICES -------------------------------------------------------------

/**
 * Sends an OTP via email or SMS based on mode.
 * @param {Object} body The parameters for sending the OTP.
 * @param {string} body.email The user's email (for email mode).
 * @param {string} body.phone The user's phone number (for phone mode).
 * @param {string} body.countryCode The country code (for phone mode).
 * @param {string} body.mode The delivery mode: 'email' or 'phone'.
 * @param {string} body.purpose The purpose: 'auth' or 'forgotPassword'.
 * @param {Object|null} [session=null] The session for transaction handling.
 * @return {Promise<Object>} The OTP document with identifierCode (code is sent via email/SMS).
 * @throws {Error} If the OTP resend limit is exceeded or delivery fails.
 */
exports.sendOtp = async (body, session = null) => {
  const {
    mode, email, phone, countryCode, purpose,
    // Optional: when mode is 'email', also send same OTP via SMS (best-effort)
    alsoSendPhone,
    alsoSendCountryCode,
  } = body;

  // DEBUG: Log the incoming request
  logInfo('[sendOtp] Starting OTP send with:', JSON.stringify({
    mode, email, phone, countryCode, purpose,
  }));

  // Find or create OTP
  let otp;
  const otpFilter = mode === 'email'
    ? { email, mode, purpose }
    : {
      phone, countryCode, mode, purpose,
    };

  logInfo('[sendOtp] Looking for existing OTP with filter:', JSON.stringify(otpFilter));
  const otpExist = await otpService.findOne({ filter: otpFilter });
  logInfo('[sendOtp] Existing OTP found:', otpExist ? 'YES' : 'NO');

  if (!otpExist) {
    logInfo('[sendOtp] Creating new OTP document...');
    otp = await otpService.create({ body: otpFilter, session });
    logInfo('[sendOtp] New OTP created:', JSON.stringify({ identifierCode: otp?.identifierCode, code: otp?.code }));
  } else {
    logInfo('[sendOtp] Updating existing OTP, resendCount:', otpExist.resendCount);
    if (otpExist.resendCount >= 5) throw new Error('ERR-103');
    const { _id: otpId } = otpExist;
    otp = await otpService.findByIdAndUpdate({
      id: otpId,
      body: {
        $inc: { resendCount: 1 },
        $set: { code: otpExist.generateCode() },
      },
      session,
    });
    logInfo('[sendOtp] OTP updated:', JSON.stringify({ identifierCode: otp?.identifierCode, code: otp?.code }));
  }

  if (!otp) {
    logError('[sendOtp] OTP object is null/undefined after create/update!');
    throw new Error('Failed to create or update OTP');
  }

  // Calculate expiry minutes from OTP_TIME_IN_SEC
  const expiryMinutes = Math.floor((env.OTP_TIME_IN_SEC || 600) / 60);

  // Send OTP via appropriate channel
  try {
    if (mode === 'email') {
      if (!email) {
        throw new Error('Email is required for email mode');
      }
      await emailService.sendOtpEmail(email, otp.code, purpose, expiryMinutes);
      logInfo(`OTP sent via email to ${email}`);

      // If requested, also send the same OTP via SMS (do not fail email delivery if SMS fails)
      if (alsoSendPhone && alsoSendCountryCode) {
        if (smsService.isConfigured()) {
          try {
            await smsService.sendOtpSMS(alsoSendPhone, alsoSendCountryCode, otp.code, purpose, expiryMinutes);
            logInfo(`OTP also sent via SMS to ${alsoSendCountryCode}${alsoSendPhone}`);
          } catch (smsError) {
            logError('Failed to also send OTP via SMS:', smsError.message || smsError);
          }
        } else {
          logError('Twilio SMS service not configured. Skipping also-send OTP via SMS.');
        }
      }
    } else if (mode === 'phone') {
      logInfo('[sendOtp] Phone mode - checking requirements...');
      if (!phone || !countryCode) {
        logError('[sendOtp] Missing phone or countryCode!');
        throw new Error('Phone number and country code are required for phone mode');
      }
      logInfo('[sendOtp] Checking if Twilio SMS service is configured...');
      logInfo('[sendOtp] smsService.isConfigured():', smsService.isConfigured());
      if (!smsService.isConfigured()) {
        const errorMsg = 'Twilio SMS service not configured. Please set TWILIO credentials in your .env file.';
        logError(errorMsg);
        throw new Error(errorMsg);
      }
      logInfo(`[sendOtp] Sending OTP ${otp.code} via SMS to ${countryCode}${phone}...`);
      await smsService.sendOtpSMS(phone, countryCode, otp.code, purpose, expiryMinutes);
      logInfo(`[sendOtp] OTP sent via SMS to ${countryCode}${phone} successfully`);
    } else {
      throw new Error(`Invalid OTP mode: ${mode}. Must be 'email' or 'phone'`);
    }
  } catch (error) {
    logError(`Failed to send OTP via ${mode}:`, error.message || error);
    // Re-throw with clearer error message
    throw new Error(`Failed to send OTP: ${error.message}`);
  }

  // Return OTP document (include code only in non-production for debugging)
  const response = {
    identifierCode: otp.identifierCode,
    mode: otp.mode,
    purpose: otp.purpose,
    resendCount: otp.resendCount,
  };

  // Include OTP code in non-production environments for debugging
  if (process.env.NODE_ENV !== 'production') {
    response.code = otp.code;
  }

  return response;
};

/**
 * Verifies an OTP and deletes it if valid.
 * @param {Object} filter The filter criteria for finding the OTP.
 * @param {string} filter.email - Email (for email mode)
 * @param {string} filter.phone - Phone number (for phone mode)
 * @param {string} filter.countryCode - Country code (for phone mode)
 * @param {string} filter.identifierCode - OTP identifier code
 * @param {string} filter.code - OTP code
 * @param {string} filter.mode - 'email' or 'phone'
 * @param {string} filter.purpose - 'auth' or 'forgotPassword'
 * @return {Promise<boolean>} True if OTP is valid and deleted, false otherwise.
 */
exports.verifyOtp = async (filter) => {
  // Build the OTP filter based on mode
  const otpFilter = {
    identifierCode: filter.identifierCode,
    code: filter.code,
    mode: filter.mode,
    purpose: filter.purpose || 'auth',
  };

  // Add email or phone filter based on mode
  if (filter.mode === 'email' && filter.email) {
    otpFilter.email = filter.email;
  } else if (filter.mode === 'phone' && filter.phone && filter.countryCode) {
    otpFilter.phone = filter.phone;
    otpFilter.countryCode = filter.countryCode;
  } else {
    return false; // Invalid filter
  }

  const otpExist = await otpService.findOneAndDelete({ filter: otpFilter });
  return !!otpExist;
};

exports.comparePassword = async (password, hash) => bcrypt.compare(password, hash);

exports.generateUsernameSuggestions = (fullname) => {
  const nameParts = fullname.trim().split(' ');
  const firstName = nameParts[0].toLowerCase();
  const lastName = nameParts.length > 1 ? nameParts[1].toLowerCase() : '';

  const suggestions = [];

  if (lastName) {
    suggestions.push(`@${firstName}${lastName}`);
    suggestions.push(`@${firstName}_${lastName}`);
    suggestions.push(`@${firstName}.${lastName}`);
    suggestions.push(`@${firstName[0]}${lastName[0]}`);
    suggestions.push(`@${firstName[0]}.${lastName[0]}`);
    suggestions.push(`@${firstName[0]}${lastName}`);
    suggestions.push(`@${firstName}${lastName[0]}`);
  }

  for (let i = 1; i <= 5; i += 1) {
    suggestions.push(`@${firstName}${i}`);
    suggestions.push(`@${firstName}_${i}`);
    suggestions.push(`@${firstName}${i}${lastName}`);
  }

  const randomChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 1; i <= 5; i += 1) {
    const randChar = randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    suggestions.push(`@${firstName}${randChar}`);
    suggestions.push(`@${firstName}_${randChar}`);
    suggestions.push(`@${firstName}${randChar}${lastName}`);
  }

  return suggestions;
};

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.countDocuments = async ({ filter = {}, session = null }) => (
  dal.countDocuments(model, { filter, session })
);
