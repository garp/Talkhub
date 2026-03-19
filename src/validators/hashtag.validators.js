const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.createHashtagSchema = Joi.object({
  hashtagPicture: Joi.string().trim().optional().allow('', null)
    .messages({
      'string.base': 'Hashtag picture must be a string',
    }),
  scope: Joi.string().required().valid('global', 'local').messages({
    'any.required': 'Scope is required to create a hashtag',
    'string.base': 'Scope must be a string',
    'any.only': 'Scope must be either "global" or "local"',
  }),
  fullLocation: Joi.string().required().messages({
    'any.required': 'Full location is required to create a hashtag',
    'string.base': 'Full location must be a string',
    'string.empty': 'Full location cannot be empty',
  }),
  coordinates: Joi.array().items(Joi.number()).required().length(2)
    .messages({
      'any.required': 'Coordinates are required to create a hashtag',
      'array.base': 'Coordinates must be an array',
      'array.length': 'Coordinates must contain exactly 2 numbers (longitude and latitude)',
    }),
  name: Joi.string().trim().required().messages({
    'any.required': 'Name is required to create a hashtag',
    'string.base': 'Name must be a string',
    'string.empty': 'Name cannot be empty',
  }),
  description: Joi.string().trim(),
  access: Joi.string().required().valid('public', 'private', 'broadcast').messages({
    'any.required': 'Access is required to create a hashtag',
    'string.base': 'Access must be a string',
    'any.only': 'Access must be either "public", "private", or "broadcast"',
  }),
  parentHashtagId: Joi.string().allow(null).optional(),
  stories: Joi.array().items(
    Joi.object({
      story: Joi.array().items(
        Joi.object({
          url: Joi.string().trim().required(),
          type: Joi.string().valid('image', 'video').required(),
        }),
      ).required(),
      name: Joi.string().trim().optional(),
    }),
  ),
  welcomeText: Joi.string().trim().optional(),
  subHashtags: Joi.array().items(Joi.string().trim()).optional(),
  // Optional: invite members at hashtag creation
  invites: Joi.array()
    .items(Joi.object({
      targetUserId: Joi.string().required().custom(ObjectId),
      // Allow various roles at hashtag creation (creator can assign roles to invited users)
      roleKey: Joi.string().trim().optional().valid('SUPER_ADMIN', 'MASTER', 'MODERATOR', 'MEMBER', 'GUEST', 'GAZER')
        .default('MEMBER'),
    }))
    .max(50)
    .optional(),
});

exports.updateHashtagSchema = Joi.object({
  scope: Joi.string().valid('global', 'local'),
  fullLocation: Joi.string().trim(),
  name: Joi.string().trim(),
  description: Joi.string().trim().allow('', null),
  hashtagPicture: Joi.string().trim().allow('', null),
  hashtagPhoto: Joi.string().trim().allow('', null),
  hashtagBanner: Joi.string().trim().allow('', null),
  access: Joi.string().valid('public', 'private', 'broadcast'),
  parentHashtagId: Joi.string().allow(null),
  subHashtags: Joi.array().items(Joi.string().trim()).optional(),
  stories: Joi.array().items(
    Joi.object({
      story: Joi.array().items(
        Joi.object({
          url: Joi.string().trim().required(),
          type: Joi.string().valid('image', 'video').required(),
        }),
      ).required(),
      name: Joi.string().trim().optional(),
    }),
  ).optional(),
});

exports.findOneHashtagSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.findOneHashtagQuerySchema = Joi.object({
  scope: Joi.string().valid('global', 'local').optional(),
});

exports.findHashtagsByRadiusSchema = Joi.object({
  longitude: Joi.number().required(),
  latitude: Joi.number().required(),
  radius: Joi.number().min(0).required(),
});

exports.paginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});

exports.searchSchema = Joi.object({
  searchText: Joi.string().optional().allow('', null),
  longitude: Joi.number().min(-180).max(180).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  radius: Joi.number().min(0).optional(),
  type: Joi.string().valid('public', 'private', 'broadcast').optional(),
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});

// Broadcast chat list pagination (socket uses page/limit; REST matches that)
exports.broadcastListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50)
    .default(20),
});

// Role assignment (admin tooling)
exports.assignHashtagRoleParamsSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.assignHashtagRoleBodySchema = Joi.object({
  targetUserId: Joi.string().required().custom(ObjectId),
  roleKey: Joi.string().trim().required().valid('SUPER_ADMIN', 'MASTER', 'MODERATOR', 'MEMBER', 'GUEST', 'GAZER'),
});

exports.findHashtagUsersQuerySchema = Joi.object({
  search: Joi.string().optional().allow('', null),
});

exports.saveHashtagSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.removeSavedHashtagSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

// Params schema for pin/unpin hashtag (alias of save/unsave)
exports.pinHashtagParamsSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

exports.notInterestedHashtagSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.notInterestedHashtagParamsSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.deleteHashtagSchema = Joi.object({
  hashtagId: Joi.string().required().messages({
    'any.required': 'Hashtag ID is required',
    'string.base': 'Hashtag ID must be a string',
  }),
});

exports.createSubHashtagSchema = Joi.object({
  hashtagPicture: Joi.string().optional(),
  name: Joi.string().required(),
});

exports.updateSubHashtagSchema = Joi.object({
  hashtagPicture: Joi.string().optional(),
  name: Joi.string().optional(),
});

// Params schema for accepting hashtag policy
exports.acceptHashtagPolicyParamsSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

// Params schema for removing a hashtag from the chat list (chat screen "remove")
exports.removeHashtagFromChatListParamsSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

// Hashtag invites / requests
exports.inviteHashtagParamsSchema = Joi.object({
  hashtagId: Joi.string().required().custom(ObjectId),
});

exports.inviteHashtagBodySchema = Joi.object({
  targetUserId: Joi.string().required().custom(ObjectId),
  // Frontend dropdown may send ADMIN; backend stores/uses SUPER_ADMIN
  roleKey: Joi.string().trim().required().valid('ADMIN', 'SUPER_ADMIN', 'MASTER', 'MODERATOR', 'MEMBER', 'GUEST', 'GAZER'),
});

exports.requestIdParamsSchema = Joi.object({
  requestId: Joi.string().required().custom(ObjectId),
});

exports.respondHashtagRequestBodySchema = Joi.object({
  status: Joi.string().required().valid('accepted', 'rejected'),
});

// Mute/unmute hashtag notifications (per user)
exports.muteHashtagBodySchema = Joi.object({
  duration: Joi.string().trim().required().valid(
    '8 hours',
    '8_hours',
    '1 day',
    '1_day',
    'always',
  ),
});

// Exit hashtag chatroom (leave hashtag chat). Optionally hide from chat list for this user.
exports.exitHashtagBodySchema = Joi.object({
  deleteForMe: Joi.boolean().default(false),
});

// Invite activity log query params
exports.inviteActivityQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
  status: Joi.string().valid('pending', 'accepted', 'rejected', 'cancelled', 'all').default('all'),
});
