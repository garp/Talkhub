const model = require('../models/highlightCollection.model');
const dal = require('../../lib/dal/dal');

exports.create = async (collectionData, session = null) => dal.create(model, { body: collectionData, session });

exports.find = async ({
  filter = {}, pagination = {}, sort = { createdAt: -1 }, projection = {}, populate = null, session = null,
}) => dal.find(model, {
  filter, pagination, sort, projection, populate, session,
});

exports.findOne = async ({
  filter = {}, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter, projection, populate, sort, session,
});

exports.findById = async ({ id, session = null, populate = null }) => {
  const query = model.findById(id);
  if (session) query.session(session);
  if (populate) query.populate(populate);
  return query;
};

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, { id, body, session });

exports.findOneAndUpdate = async ({ filter, body, session = null }) => dal.findOneAndUpdate(model, { filter, body, session });

exports.deleteOne = async ({ filter, session = null }) => dal.deleteOne(model, { filter, session });

exports.findByIdAndDelete = async ({ id, session = null }) => {
  const options = session ? { session } : {};
  return model.findByIdAndDelete(id, options);
};

exports.count = async ({ filter = {}, session = null }) => {
  const query = model.countDocuments(filter);
  if (session) query.session(session);
  return query;
};
