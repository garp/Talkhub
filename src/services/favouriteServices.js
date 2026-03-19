const model = require('../models/favourite.model');
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

exports.findOne = async ({ filter, session = null }) => dal.findOne(model, { filter, session });

exports.findOneAndUpsert = async ({
  filter, body, session = null,
}) => dal.findOneAndUpsert(model, {
  filter, body, session,
});

exports.deleteOne = async ({ filter, session = null }) => (
  dal.deleteOne(model, { filter, session })
);

exports.findOneAndDelete = async ({ filter, session = null }) => (
  dal.findOneAndDelete(model, { filter, session })
);

exports.deleteMany = async ({ filter, session = null }) => (
  dal.deleteMany(model, { filter, session })
);

exports.countDocuments = async ({ filter = {}, session = null }) => (
  dal.countDocuments(model, { filter, session })
);

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });
