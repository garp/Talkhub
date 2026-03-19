const Joi = require('joi');
const { ObjectId } = require('./common.validators');

// Schema for viewing chatroom messages
exports.viewSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

// Schema for joining a chatroom
exports.joinSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

// Schema for clearing messages in a hashtag chatroom (by hashtagId)
exports.clearMessagesSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

// Bulk delete/leave hashtag chats
exports.deleteHashtagChatsSchema = Joi.object({
  hashtagIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1).required(),
});

// Hashtag-only message search ("chits search")
exports.searchHashtagChitsQuerySchema = Joi.object({
  keyword: Joi.string().trim().min(1).max(200)
    .required(),
  hashtagId: Joi.string().optional().allow('', null).custom(ObjectId),
  pageNum: Joi.number().integer().min(1)
    .default(1),
  pageSize: Joi.number().integer().min(1).max(100)
    .default(20),
});

// Polls (REST testing endpoints)
exports.sendHashtagPollSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
  content: Joi.string().allow('', null).optional(),
  parentMessageId: Joi.string().allow(null).optional().custom(ObjectId),
  subHashtagId: Joi.string().allow(null).optional().custom(ObjectId),
  poll: Joi.object({
    question: Joi.string().trim().min(1).max(300)
      .required(),
    options: Joi.array().items(
      Joi.alternatives().try(
        Joi.string().trim().min(1).max(100),
        Joi.object({
          text: Joi.string().trim().min(1).max(100)
            .required(),
        }),
      ),
    ).min(2).max(12)
      .required(),
    allowsMultipleAnswers: Joi.boolean().default(false),
    isAnonymous: Joi.boolean().default(false),
    isQuiz: Joi.boolean().default(false),
    correctOptionIndex: Joi.number().integer().min(0).optional(),
    expiresAt: Joi.date().iso().optional().allow(null),
  }).required(),
});

exports.voteHashtagPollSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
  messageId: Joi.string().required().custom(ObjectId),
  selectedOptionIds: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
});
