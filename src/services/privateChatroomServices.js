const model = require('../models/privateChatroom.model');
const dal = require('../../lib/dal/dal');

// MONGODB SERVICES -----------------------------------------------------------
exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.findByIdAndUpdate = async ({ id, body, session = null }) => (
  dal.findByIdAndUpdate(model, { id, body, session })
);

exports.findOneAndUpdate = async ({
  filter, body, session = null, customOptions = {},
}) => (
  dal.findOneAndUpdate(model, {
    filter,
    body,
    session,
    customOptions,
  })
);

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

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.deleteOne = async ({ filter, session = null }) => dal.deleteOne(model, { filter, session });

exports.findOneAndDelete = async ({ filter, session = null }) => dal.findOneAndDelete(model, { filter, session });
