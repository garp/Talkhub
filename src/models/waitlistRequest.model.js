const mongoose = require('mongoose');

const { Schema } = mongoose;
const { waitlistStatus } = require('../../lib/constants/userConstants');

const waitlistRequestSchema = new Schema(
  {
    fullName: { type: String, trim: true, required: true },
    email: {
      type: String, trim: true, default: null,
    },
    phoneNumber: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    fullLocation: { type: String, trim: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    dateOfBirth: { type: Date, default: null },
    referredBy: { type: String, trim: true, default: null },
    reason: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: [waitlistStatus.PENDING, waitlistStatus.APPROVED, waitlistStatus.REJECTED],
      default: waitlistStatus.PENDING,
    },
    reservedUsername: {
      type: String, trim: true, default: null,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

waitlistRequestSchema.index({ location: '2dsphere' });
waitlistRequestSchema.index({ status: 1, createdAt: -1 });
waitlistRequestSchema.index({ phoneNumber: 1, countryCode: 1 }, { sparse: true });
waitlistRequestSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
waitlistRequestSchema.index(
  { reservedUsername: 1 },
  { unique: true, partialFilterExpression: { reservedUsername: { $type: 'string' } } },
);

module.exports = mongoose.model('waitlistRequests', waitlistRequestSchema);
