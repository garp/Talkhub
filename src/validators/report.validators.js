const Joi = require('joi');
const { reportStatus } = require('../../lib/constants/userConstants');

exports.reportUserSchema = Joi.object({
  reportedToId: Joi.string().required(),
  reason: Joi.string().required(),
  hashtagId: Joi.string().required(),
});

exports.getReportSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.actionReportSchema = Joi.object({
  reportId: Joi.string().required(),
  action: Joi.string().valid(reportStatus.APPROVED, reportStatus.REJECT),
});

/** Report a group/chatroom. leaveAfterReport: if true, also remove the user from the group. */
exports.reportGroupSchema = Joi.object({
  chatroomId: Joi.string().required(),
  chatroomType: Joi.string().valid('hashtag', 'private').required(),
  reason: Joi.string().trim().min(1).required(),
  leaveAfterReport: Joi.boolean().default(false),
});
