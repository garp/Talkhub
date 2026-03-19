const twilio = require('twilio');
const env = require('../../lib/configs/env.config');
const { logInfo, logError } = require('../../lib/helpers/logger');

/**
 * SMS Service for sending OTP via Twilio
 */
class SMSService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  /**
     * Initialize Twilio client
     */
  initializeClient() {
    try {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        logError('Twilio credentials not configured. SMS service will not be available.');
        logError('Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your .env file');
        return;
      }

      if (!env.TWILIO_PHONE_NUMBER) {
        logError('Twilio phone number not configured. SMS service will not be available.');
        logError('Please set TWILIO_PHONE_NUMBER in your .env file');
        return;
      }

      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      logInfo('Twilio SMS service initialized successfully');
    } catch (error) {
      logError('Failed to initialize Twilio client:', error.message || error);
      this.client = null;
    }
  }

  /**
     * Format phone number for Twilio
     * @param {string} phoneNumber - Phone number
     * @param {string} countryCode - Country code (e.g., '+1', '+91')
     * @returns {string} - Formatted phone number
     */
  // eslint-disable-next-line class-methods-use-this
  formatPhoneNumber(phoneNumber, countryCode = '+1') {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // If country code is provided and doesn't start with +
    let formattedCountryCode = countryCode;
    if (countryCode && !countryCode.startsWith('+')) {
      formattedCountryCode = `+${countryCode}`;
    }

    // If phone number already includes country code, return as is
    if (cleaned.startsWith(formattedCountryCode.replace('+', ''))) {
      return `${formattedCountryCode}${cleaned}`;
    }

    // Combine country code with phone number
    return `${formattedCountryCode}${cleaned}`;
  }

  /**
     * Send OTP via SMS
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} countryCode - Country code (e.g., '+1', '+91')
     * @param {string} otpCode - 6-digit OTP code
     * @param {string} purpose - Purpose of OTP (e.g., 'authentication', 'password reset')
     * @param {number} expiryMinutes - OTP expiry time in minutes
     * @returns {Promise<Object>} - Send result
     */
  // eslint-disable-next-line no-unused-vars
  async sendOtpSMS(phoneNumber, countryCode, otpCode, purpose = 'authentication', expiryMinutes = 10) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized. Please check your credentials.');
      }

      if (!env.TWILIO_PHONE_NUMBER) {
        throw new Error('Twilio phone number not configured');
      }

      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phoneNumber, countryCode);

      // Prepare SMS message
      const message = `Your TalkHub verification code is: ${otpCode}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nDo not share this code with anyone.\n\nDk8S+bhancr`;

      // Send SMS
      const messageResponse = await this.client.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to: formattedPhone,
      });

      logInfo(`OTP SMS sent successfully to ${formattedPhone}. SID: ${messageResponse.sid}`);

      return {
        success: true,
        messageSid: messageResponse.sid,
        to: formattedPhone,
        status: messageResponse.status,
      };
    } catch (error) {
      logError(`Failed to send OTP SMS to ${phoneNumber}:`, error);

      // Provide more specific error messages
      if (error.code === 21211) {
        throw new Error('Invalid phone number format');
      } else if (error.code === 21608) {
        throw new Error('Unverified phone number. Please verify your number in Twilio console.');
      } else if (error.code === 21408) {
        throw new Error('Permission denied. Check Twilio account permissions.');
      }

      throw error;
    }
  }

  /**
     * Send generic SMS
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} countryCode - Country code
     * @param {string} message - SMS message
     * @returns {Promise<Object>} - Send result
     */
  async sendSMS(phoneNumber, countryCode, message) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, countryCode);

      const messageResponse = await this.client.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to: formattedPhone,
      });

      logInfo(`SMS sent successfully to ${formattedPhone}. SID: ${messageResponse.sid}`);

      return {
        success: true,
        messageSid: messageResponse.sid,
        to: formattedPhone,
        status: messageResponse.status,
      };
    } catch (error) {
      logError(`Failed to send SMS to ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
     * Verify if Twilio is properly configured
     * @returns {boolean}
     */
  isConfigured() {
    return !!(
      env.TWILIO_ACCOUNT_SID
      && env.TWILIO_AUTH_TOKEN
      && env.TWILIO_PHONE_NUMBER
      && this.client
    );
  }
}

// Export singleton instance
module.exports = new SMSService();
