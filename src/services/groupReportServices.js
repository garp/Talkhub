const model = require('../models/groupReport.model');
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

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });
