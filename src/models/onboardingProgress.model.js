const mongoose = require('mongoose');

const { Schema } = mongoose;

const onboardingProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      unique: true,
    },
    nameAdded: { type: Boolean, default: false },
    userNameAdded: { type: Boolean, default: false },
    dobAdded: { type: Boolean, default: false },
    profilePhotoAdded: { type: Boolean, default: false },
    descriptionAdded: { type: Boolean, default: false },
    interestsAdded: { type: Boolean, default: false },
    rulesAccepted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

onboardingProgressSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('onboardingProgress', onboardingProgressSchema);
