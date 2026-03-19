const model = require('../models/onboardingProgress.model');
const dal = require('../../lib/dal/dal');

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findById = async ({ id, projection = {}, session = null }) => dal.findById(model, {
  id, projection, session,
});

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, {
  id, body, session,
});

exports.findOneAndUpdate = async ({ filter, body, session = null }) => (
  dal.findOneAndUpdate(model, { filter, body, session })
);

exports.findOneAndUpsert = async ({ filter, body, session = null }) => (
  dal.findOneAndUpsert(model, { filter, body, session })
);
