const model = require('../models/like.model');
const dal = require('../../lib/dal/dal');

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

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });
