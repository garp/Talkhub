const model = require('../models/otp.model');
const dal = require('../../lib/dal/dal');

// MONGODB SERVICES -----------------------------------------------------------

exports.findOne = async ({
  filter,
  projection = {},
  populate = null,
  sort = {},
  session = null,
}) => (
  dal.findOne(model, {
    filter, projection, populate, sort, session,
  })
);

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);

exports.findByIdAndUpdate = async ({ id, body, session = null }) => (
  dal.findByIdAndUpdate(model, { id, body, session })
);

exports.findOneAndDelete = async ({ filter }) => dal.findOneAndDelete(model, { filter });
