const model = require('../models/post.model');
const saveModel = require('../models/save.model');
const dal = require('../../lib/dal/dal');

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.find = async ({
  filter = {},
  pagination = {},
  sort = {},
  projection = {},
  populate = null,
  session = null,
}) => dal.find(model, {
  filter, pagination, sort, projection, populate, session,
});

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, {
  id, body, session,
});

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findOneAndDelete = async ({ filter, session = null }) => (
  dal.findOneAndDelete(model, { filter, session })
);

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, {
  filter, session,
});

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.createSave = async ({ body, session = null }) => dal.create(saveModel, { body, session });

exports.findSave = async ({
  filter = {}, pagination = {}, sort = {}, projection = {}, populate = null, session = null,
}) => dal.find(saveModel, {
  filter, pagination, sort, projection, populate, session,
});

exports.findOneSave = async ({
  filter = {}, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(saveModel, {
  filter, projection, populate, sort, session,
});

exports.removeSavedPost = async ({ filter, session = null }) => dal.findOneAndDelete(saveModel, { filter, session });

exports.deleteManySave = async ({ filter, session = null }) => dal.deleteMany(saveModel, { filter, session });

exports.aggregateSave = async ({ query, session = null }) => dal.aggregate(saveModel, { query, session });

exports.incrementViewCount = async ({ postId, session = null }) => model.findByIdAndUpdate(
  postId,
  { $inc: { viewCount: 1 } },
  { new: true, session },
);
