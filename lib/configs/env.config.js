module.exports = {
  OTP_TIME_IN_SEC: Number(process.env.OTP_TIME_IN_SEC),
  SALT_ROUNDS: Number(process.env.SALT_ROUNDS),
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,

  // APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  // APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  // APPLE_KEY_ID: process.env.APPLE_KEY_ID,
  // APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,

  SMTP_HOST: process.env.SMTP_HOST || 'smtp.office365.com',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'TalkHub',
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  // Twilio SMS Configuration
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,

  // Short Link Configuration
  SHORT_LINK_BASE_URL: process.env.SHORT_LINK_BASE_URL || 'https://talkhub.co/s',
};
