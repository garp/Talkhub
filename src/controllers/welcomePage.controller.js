const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const welcomePageServices = require('../services/welcomePageServices');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const hashtagServices = require('../services/hashtagServices');
const chatroomServices = require('../services/chatroomServices');

exports.updateWelcomePage = asyncHandler(async (req, res) => {
  const {
    hashtagId,
    title,
    description,
    language,
    rules,
    ageRange,
    fullLocation,
    coordinates,
  } = req.value;
  const { userId } = req.user;
  const chatroom = await chatroomServices.findOne({
    filter: { hashtagId },
    projection: { admins: 1, moderators: 1 },
  });
  if (!chatroom) {
    return errorHandler('ERR-116', res);
  }
  const adminIds = chatroom.admins.map((admin) => admin.userId);
  const moderatorIds = chatroom.moderators.map((moderator) => moderator.userId);
  const combinedIds = adminIds.concat(moderatorIds);
  const isUserAuthorized = combinedIds.some((combinedId) => combinedId.equals(userId));
  if (!isUserAuthorized) {
    return errorHandler('ERR-129', res);
  }
  const body = {};
  const bodyHashtag = {};
  if (title) {
    body.title = title;
  }
  if (description) {
    body.description = description;
    bodyHashtag.description = description;
  }
  if (language) {
    body.language = language;
  }
  if (rules) {
    body.rules = rules;
  }
  if (ageRange) {
    body.ageRange = ageRange;
  }
  if (fullLocation) {
    body.fullLocation = fullLocation;
    bodyHashtag.fullLocation = fullLocation;
  }
  if (coordinates) {
    body.location = {
      type: 'Point',
      coordinates,
    };
    bodyHashtag.location = {
      type: 'Point',
      coordinates,
    };
  }
  await hashtagServices.findByIdAndUpdate({
    id: hashtagId,
    body: {
      hashtagId,
      ...bodyHashtag,
    },
  });
  const welcomePage = await welcomePageServices.findOneAndUpdate({
    filter: { hashtagId },
    body: {
      hashtagId,
      ...body,
    },
  });
  return responseHandler(welcomePage, res);
});
