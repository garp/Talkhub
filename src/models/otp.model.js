const mongoose = require('mongoose');

const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');
const env = require('../../lib/configs/env.config');

const otpSchema = new Schema(
  {
    identifierCode: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      match: [/^\d{6}$/, 'Code must be a 6 digit number'],
      trim: true,
    },
    purpose: {
      type: String,
      trim: true,
      enum: ['auth', 'forgotPassword', 'secondaryContact'],
      required: [true, 'Purpose is required'],
    },
    mode: {
      type: String,
      enum: ['email', 'phone'],
      required: [true, 'Mode is required'],
    },
    email: {
      type: String,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'Email is invalid'],
    },
    countryCode: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\d{5,20}$/, 'Phone number must be a number and 5 to 20 digits long'],
    },
    resendCount: {
      type: Number,
      default: 0,
      min: [0, 'Resend count cannot be negative'],
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
otpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: env.OTP_TIME_IN_SEC });
otpSchema.index({ email: 1 }); // Lookup by email
otpSchema.index({ phone: 1 }); // Lookup by phone
otpSchema.index({ identifierCode: 1 }); // Lookup by identifier code
otpSchema.index({ email: 1, purpose: 1 }); // Email OTPs by purpose
otpSchema.index({ phone: 1, purpose: 1 }); // Phone OTPs by purpose

otpSchema.pre('save', function preSave(next) {
  if (this.isNew) {
    this.identifierCode = uuidv4();
    this.code = Math.floor(100000 + Math.random() * 900000).toString();
  }
  next();
});

otpSchema.methods.generateCode = function generateCode() {
  this.code = Math.floor(100000 + Math.random() * 900000).toString();
  return this.code;
};

module.exports = mongoose.model('otps', otpSchema);
