const model = require('../models/message.model');
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

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findByIdAndUpdate = async ({ id, body, session = null }) => (
  dal.findByIdAndUpdate(model, { id, body, session })
);

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);

exports.findOneAndUpsert = async ({
  filter, body, session = null,
}) => dal.findOneAndUpsert(model, {
  filter, body, session,
});

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.updateMany = async ({ filter, body, session = null }) => dal.updateMany(model, { filter, body, session });

exports.bulkWrite = async (operations, { session = null } = {}) => dal.bulkWrite(model, operations, { session });

exports.deleteOne = async ({ filter, session = null }) => (
  dal.deleteOne(model, { filter, session })
);

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, {
  filter, session,
});
