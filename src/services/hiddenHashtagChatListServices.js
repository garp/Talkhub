const model = require('../models/hiddenHashtagChatList.model');
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

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findOneAndUpsert = async ({ filter, body, session = null }) => dal.findOneAndUpsert(model, {
  filter,
  body,
  session,
});

exports.findOneAndDelete = async ({ filter, session = null }) => dal.findOneAndDelete(model, { filter, session });

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, { filter, session });
