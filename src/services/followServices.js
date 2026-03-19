const model = require('../models/follow.model');
const dal = require('../../lib/dal/dal');

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });

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

exports.deleteOne = async ({ filter, session = null }) => dal.deleteOne(model, { filter, session });

exports.findOneAndDelete = async ({ filter, session = null }) => dal.findOneAndDelete(model, { filter, session });

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, { filter, session });

exports.countDocuments = async ({ filter = {} }) => {
  const result = await model.countDocuments(filter);
  return result;
};
