exports.userStatus = {
  CREATED: 'created',
  INFO_ADDED: 'infoAdded',
  VERIFIED: 'verified',
};

exports.userLoginModes = {
  FACEBOOK: 'facebook',
  GOOGLE: 'google',
  APPLE: 'apple',
};

exports.userRoles = {
  USER: 'user',
  GOD: 'god',
};

exports.reportStatus = {
  PENDING: 'pending',
  APPROVED: 'approve',
  REJECT: 'reject',
};

exports.deleteStatus = {
  NONE: 'none',
  TEMPORARY: 'temporary',
};

exports.waitlistStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/**
 * Last completed onboarding step — frontend uses this to show the screen where user left off.
 * Render next step based on lastOnboardingStep.
 */
exports.onboardingStep = {
  INFO_ADDED: 'infoAdded',
  DESCRIPTION_AND_PHOTO_ADDED: 'descriptionAndPhotoAdded',
  INTERESTS_ADDED: 'interestsAdded',
  RULES_ACCEPTED: 'rulesAccepted',
};
