const mongoose = require('mongoose');

// SESSION --------------------------------------------------------------------
exports.startTransaction = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  session.transactionState = 'active';
  return session;
};

exports.commitTransaction = async (session) => {
  if (session.transactionState === 'active') {
    await session.commitTransaction();
    const updatedSession = { ...session, transactionState: 'committed' }; // Create a new session object
    await updatedSession.endSession();
    return true;
  }
  return false; // Return false if transaction was not committed
};

exports.abortTransaction = async (session) => {
  if (session.transactionState === 'active') {
    await session.abortTransaction();
    const updatedSession = { ...session, transactionState: 'aborted' }; // Create a new session object
    await updatedSession.endSession();
  }
  return true;
};

// CREATE DATA ----------------------------------------------------------------
exports.create = async (model, { body, session = null }) => {
  const options = session ? { session } : {};
  const result = await model.create([body], options);
  return result[0];
};

exports.createMany = async (model, { body, session = null }) => {
  const options = session ? { session } : {};
  return model.create(body, options); // Removed redundant await
};

// READ DATA ------------------------------------------------------------------
exports.find = async (
  model,
  {
    filter = {},
    pagination = {},
    sort = {},
    projection = {},
    populate = null,
    session = null,
  },
) => {
  const query = model.find(filter, projection);
  if (session) query.session(session);
  if (populate) query.populate(populate);
  return query.sort(sort).skip(pagination.skip).limit(pagination.limit);
};

exports.findOne = async (
  model,
  {
    filter = {},
    projection = {},
    populate = null,
    sort = {},
    session = null,
  },
) => {
  const query = model.findOne(filter, projection);
  if (session) query.session(session);
  if (populate) query.populate(populate);
  return query.sort(sort);
};

exports.findById = async (model, { id, session = null }) => {
  const data = model.findById(id);
  return session ? data.session(session) : data;
};

// UPDATE DATA ----------------------------------------------------------------
exports.findByIdAndUpdate = async (model, { id, body, session = null }) => {
  const options = session
    ? {
      session,
      new: true,
      runValidators: true,
    }
    : {
      new: true,
      runValidators: true,
    };
  return model.findByIdAndUpdate(id, body, options);
};

exports.findOneAndUpdate = async (model, {
  filter,
  body,
  session = null,
  customOptions = {},
}) => {
  const options = session ? { session, ...customOptions } : { ...customOptions };
  return model.findOneAndUpdate(filter, body, {
    runValidators: true,
    new: true,
    ...options,
  });
};

exports.updateAndPopulate = async (
  model,
  {
    filter,
    body,
    populate = null,
    session = null,
  },
) => {
  const options = {
    new: true,
    runValidators: true,
  };
  if (session) options.session = session;
  return model.findOneAndUpdate(filter, body, options).populate(populate);
};

exports.updateAndReturnPrevious = async (model, { filter, body, session = null }) => {
  const options = {
    new: false,
    runValidators: true,
  };
  if (session) options.session = session;
  return model.findOneAndUpdate(filter, body, options); // Removed redundant await
};

exports.findOneAndUpsert = async (model, { filter, body, session }) => {
  const options = {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  };
  if (session) options.session = session;

  return model.findOneAndUpdate(filter, body, options);
};

exports.updateMany = async (model, { filter, body, session = null }) => {
  const options = session ? { session } : {};
  return model.updateMany(filter, body, { new: true, ...options }); // Removed redundant await
};

// DELETE DATA ----------------------------------------------------------------
exports.deleteOne = async (model, { filter, session = null }) => {
  const options = session ? { session } : {};
  return model.deleteOne(filter, options);
};

exports.findOneAndDelete = async (model, { filter, session = null }) => {
  const options = session ? { session } : {};
  return model.findOneAndDelete(filter, options); // Removed redundant await
};

exports.deleteMany = async (model, { filter, session = null }) => {
  const options = session ? { session } : {};
  return model.deleteMany(filter, options); // Removed redundant await
};

// AGGREGATION ----------------------------------------------------------------
exports.aggregate = async (model, { query, session = null }) => {
  const data = model.aggregate(query);
  return data.session(session || null);
};

// COUNT DOCUMENTS ------------------------------------------------------------
exports.countDocuments = async (model, { filter = {}, session = null }) => {
  const options = session ? { session } : {};
  return model.countDocuments(filter, options);
};

// BULK WRITE DATA -----------------------------------------------------------
exports.bulkWrite = async (model, operations, { session = null }) => {
  const options = session ? { session } : {};
  return model.bulkWrite(operations, options);
};
