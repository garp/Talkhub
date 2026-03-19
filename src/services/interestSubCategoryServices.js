const model = require('../models/interestSubCategory.model');
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

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, {
  id, body, session,
});

exports.findOneAndUpdate = async ({ filter, body, session = null }) => dal.findOneAndUpdate(model, {
  filter, body, session,
});

exports.updateMany = async ({ filter, body, session = null }) => dal.updateMany(model, {
  filter, body, session,
});

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, {
  filter, session,
});

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });
