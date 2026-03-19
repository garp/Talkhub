const model = require('../models/shortlink.model');
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

exports.findOne = async ({ filter, projection = {}, session = null }) => (
  dal.findOne(model, { filter, projection, session })
);

exports.findOneAndUpdate = async ({
  filter, body, session = null, customOptions = {},
}) => dal.findOneAndUpdate(model, {
  filter, body, session, customOptions,
});

exports.deleteOne = async ({ filter, session = null }) => (
  dal.deleteOne(model, { filter, session })
);

exports.findOneAndDelete = async ({ filter, session = null }) => (
  dal.findOneAndDelete(model, { filter, session })
);

exports.countDocuments = async ({ filter = {}, session = null }) => (
  dal.countDocuments(model, { filter, session })
);

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

/**
 * Generate unique code using the model's static method
 * @returns {Promise<string>} Unique 6-character code
 */
exports.generateUniqueCode = async () => model.generateUniqueCode();
