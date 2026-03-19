const model = require('../models/chatSummary.model');
const dal = require('../../lib/dal/dal');

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);

exports.findOneAndUpsert = async ({
  filter, body, session = null,
}) => dal.findOneAndUpsert(model, { filter, body, session });
