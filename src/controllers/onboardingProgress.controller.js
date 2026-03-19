const onboardingProgressService = require('../services/onboardingProgressService');
const userServices = require('../services/userServices');
const interestSubCategoryServices = require('../services/interestSubCategoryServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');

const DEFAULT_PROGRESS = {
  nameAdded: false,
  userNameAdded: false,
  dobAdded: false,
  profilePhotoAdded: false,
  descriptionAdded: false,
  interestsAdded: false,
  rulesAccepted: false,
};

/**
 * GET /user/onboarding/:userId
 * Returns onboarding progress for the user. No auth; userId from params.
 * If no record exists, returns default (all false).
 */
exports.getOnboardingProgress = asyncHandler(async (req, res) => {
  const { userId } = req.value;

  const progress = await onboardingProgressService.findOne({
    filter: { userId },
  });

  if (!progress) {
    return responseHandler(
      {
        userId,
        ...DEFAULT_PROGRESS,
      },
      res,
    );
  }

  return responseHandler(
    {
      userId: progress.userId,
      nameAdded: progress.nameAdded,
      userNameAdded: progress.userNameAdded,
      dobAdded: progress.dobAdded,
      profilePhotoAdded: progress.profilePhotoAdded,
      descriptionAdded: progress.descriptionAdded,
      interestsAdded: progress.interestsAdded,
      rulesAccepted: progress.rulesAccepted,
    },
    res,
  );
});

/**
 * POST /user/onboarding
 * Creates an onboarding progress record for the logged-in user. All keys default to false.
 * If record already exists, returns existing.
 */
exports.createOnboardingProgress = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const existing = await onboardingProgressService.findOne({
    filter: { userId },
  });

  if (existing) {
    return responseHandler(
      {
        userId: existing.userId,
        nameAdded: existing.nameAdded,
        userNameAdded: existing.userNameAdded,
        dobAdded: existing.dobAdded,
        profilePhotoAdded: existing.profilePhotoAdded,
        descriptionAdded: existing.descriptionAdded,
        interestsAdded: existing.interestsAdded,
        rulesAccepted: existing.rulesAccepted,
      },
      res,
    );
  }

  const created = await onboardingProgressService.create({
    body: {
      userId,
      ...DEFAULT_PROGRESS,
    },
  });

  return responseHandler(
    {
      userId: created.userId,
      nameAdded: created.nameAdded,
      userNameAdded: created.userNameAdded,
      dobAdded: created.dobAdded,
      profilePhotoAdded: created.profilePhotoAdded,
      descriptionAdded: created.descriptionAdded,
      interestsAdded: created.interestsAdded,
      rulesAccepted: created.rulesAccepted,
    },
    res,
    201,
  );
});

/**
 * PUT /user/onboarding/:userId
 * Updates onboarding progress. No auth; userId from params.
 * nameAdded and userNameAdded can only be set to true (never false).
 * Other keys can be true or false (e.g. false when user skips).
 *
 * When `step` and relevant data fields (e.g. interestSubCategories) are
 * provided, the handler also persists that data on the user document —
 * mirroring the logic in user.controller.onboarding.
 */
exports.updateOnboardingProgress = asyncHandler(async (req, res) => {
  const {
    userId,
    step,
    description,
    language,
    occupation,
    school,
    religion,
    interestSubCategories,
    ...rest
  } = req.value;

  // --- Persist actual onboarding data on the user document when step is provided ---
  if (step) {
    const userUpdate = {};

    if (step === 'describe') {
      userUpdate.description = description;
    } else if (step === 'details') {
      userUpdate.languages = language ? [language] : [];
      userUpdate.occupation = occupation || null;
      userUpdate.education = school || null;
      userUpdate.religion = religion || null;
    } else if (step === 'interests' && Array.isArray(interestSubCategories) && interestSubCategories.length) {
      const subCategories = await interestSubCategoryServices.find({
        filter: { _id: { $in: interestSubCategories }, isActive: true },
      });

      if (!subCategories || subCategories.length !== interestSubCategories.length) {
        return errorHandler('ERR-137', res);
      }

      const categoryIdSet = new Set(
        subCategories.map((sc) => sc.categoryId.toString()),
      );
      userUpdate.interestSubCategories = interestSubCategories;
      userUpdate.interestCategories = [...categoryIdSet];
    } else if (step === 'communityRules') {
      userUpdate.rulesAcceptedAt = new Date();
    }

    if (Object.keys(userUpdate).length) {
      const updatedUser = await userServices.findByIdAndUpdate({
        id: userId,
        body: { $set: userUpdate },
      });

      if (!updatedUser) {
        return errorHandler('ERR-102', res);
      }
    }
  }

  // --- Update onboarding progress tracking flags ---
  const progressFields = { ...rest };
  if (progressFields.nameAdded === false) delete progressFields.nameAdded;
  if (progressFields.userNameAdded === false) delete progressFields.userNameAdded;

  // Auto-set progress flags based on step so callers don't need to send both
  if (step === 'interests' && progressFields.interestsAdded === undefined) {
    progressFields.interestsAdded = true;
  }
  if (step === 'communityRules' && progressFields.rulesAccepted === undefined) {
    progressFields.rulesAccepted = true;
  }
  if (step === 'describe' && progressFields.descriptionAdded === undefined) {
    progressFields.descriptionAdded = true;
  }

  let progress = await onboardingProgressService.findOne({ filter: { userId } });

  if (!progress) {
    progress = await onboardingProgressService.create({
      body: { userId, ...DEFAULT_PROGRESS, ...progressFields },
    });
  } else {
    progress = await onboardingProgressService.findOneAndUpdate({
      filter: { userId },
      body: { $set: progressFields },
    });
  }

  if (!progress) {
    return errorHandler('ERR-102', res);
  }

  return responseHandler(
    {
      userId: progress.userId,
      nameAdded: progress.nameAdded,
      userNameAdded: progress.userNameAdded,
      dobAdded: progress.dobAdded,
      profilePhotoAdded: progress.profilePhotoAdded,
      descriptionAdded: progress.descriptionAdded,
      interestsAdded: progress.interestsAdded,
      rulesAccepted: progress.rulesAccepted,
    },
    res,
  );
});
