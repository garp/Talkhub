const Joi = require('joi');
const { ObjectId } = require('./common.validators');

// Schema for creating a private group chat
exports.createPrivateGroupChatSchema = Joi.object({
  name: Joi.string().required().min(1).max(100),
  participants: Joi.array().items(Joi.string().custom(ObjectId)).min(1).required(),
});

// Params schema for clearing messages in a private chatroom
exports.clearPrivateChatroomMessagesParamsSchema = Joi.object({
  chatroomId: Joi.string().required().custom(ObjectId),
});

// Params schema for pin/unpin private chatroom
exports.pinPrivateChatroomParamsSchema = Joi.object({
  chatroomId: Joi.string().required().custom(ObjectId),
});

// Query schema for searching users in a private chatroom (mentions)
exports.privateChatroomUsersQuerySchema = Joi.object({
  search: Joi.string().optional().allow('', null),
});

// Bulk delete/leave private chatrooms
exports.deletePrivateChatroomsSchema = Joi.object({
  chatroomIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1).required(),
});

// Polls (REST testing endpoints)
exports.sendPrivatePollSchema = Joi.object({
  chatroomId: Joi.string().required().custom(ObjectId),
  content: Joi.string().allow('', null).optional(),
  parentMessageId: Joi.string().allow(null).optional().custom(ObjectId),
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

exports.votePrivatePollSchema = Joi.object({
  chatroomId: Joi.string().required().custom(ObjectId),
  messageId: Joi.string().required().custom(ObjectId),
  selectedOptionIds: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
});

// Private group management (REST helpers; sockets are primary)
exports.privateGroupAddParticipantsBodySchema = Joi.object({
  participantIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1).required(),
});

exports.privateGroupRemoveParticipantsBodySchema = Joi.object({
  participantIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1).required(),
});

exports.privateGroupAddAdminBodySchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

exports.privateGroupRemoveAdminBodySchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

// Mute/unmute private chatroom notifications (per user participant)
exports.mutePrivateChatroomBodySchema = Joi.object({
  duration: Joi.string().trim().required().valid(
    '8 hours',
    '8_hours',
    '1 day',
    '1_day',
    'always',
  ),
});

// Exit private chatroom. For group chats:
// - deleteForMe=false: exit (isPresent=false) but keep it visible in list
// - deleteForMe=true: exit + hide it from list for this user (deletedForMe=true)
exports.exitPrivateChatroomBodySchema = Joi.object({
  deleteForMe: Joi.boolean().default(false),
});

// Update private group chat details (admin/GOD only)
exports.updatePrivateGroupChatDetailsBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100)
    .optional(),
  description: Joi.string().trim().allow('', null).max(500)
    .optional(),
  groupPicture: Joi.string().trim().allow('', null).optional(),
}).min(1);
