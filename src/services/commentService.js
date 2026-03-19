const { Comment, CommentLike } = require('../models/comments.model');
const dal = require('../../lib/dal/dal');

exports.create = async ({ body, session = null }) => dal.create(Comment, { body, session });

exports.find = async ({
  filter = {}, pagination = {}, sort = {}, projection = {}, populate = null, session = null,
}) => dal.find(Comment, {
  filter, pagination, sort, projection, populate, session,
});

exports.findById = async ({ id, session = null }) => dal.findById(Comment, { id, session });

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(Comment, { id, body, session });

exports.findOneAndUpdate = async ({ filter, body, session = null }) => dal.findOneAndUpdate(Comment, { filter, body, session });

exports.findOneAndDelete = async ({ filter, session = null }) => dal.findOneAndDelete(Comment, { filter, session });

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(Comment, { filter, session });

exports.aggregate = async ({ query, session = null }) => dal.aggregate(Comment, { query, session });

// Like Services
exports.likeComment = async ({ filter, session = null }) => {
  // Check if a like already exists
  const existing = await dal.findOne(CommentLike, { filter, session });
  if (existing) {
    // If exists, delete it (toggle off)
    await dal.deleteOne(CommentLike, { filter, session });
    return { liked: false };
  }
  // If not exists, create it (toggle on)
  await dal.create(CommentLike, { body: filter, session });
  return { liked: true };
};
