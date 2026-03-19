const model = require('../models/notification.model');
const dal = require('../../lib/dal/dal');
const { getIO } = require('../events/socketInstance');
const { socketEvents } = require('../../lib/constants/socket');
const { notificationByIdWithUser } = require('../queries/notifications.queries');

async function emitNotificationChange({ notificationId, action }) {
  try {
    const io = getIO();
    if (!io || !notificationId) return;

    // Enrich payload (sender/chatroom) if possible
    let notificationPayload = null;
    try {
      const enriched = await dal.aggregate(model, { query: notificationByIdWithUser(notificationId) });
      if (Array.isArray(enriched)) {
        const [firstEnriched] = enriched;
        if (firstEnriched) notificationPayload = firstEnriched;
      }
    } catch (e) {
      // ignore enrichment errors
    }

    if (!notificationPayload) {
      notificationPayload = await dal.findById(model, { id: notificationId });
    }
    const recipientRoom = notificationPayload && notificationPayload.userId ? notificationPayload.userId.toString() : null;
    if (!recipientRoom) return;

    io.to(recipientRoom).emit(socketEvents.GET_NOTIFICATION_SUCCESS, {
      action,
      notification: notificationPayload,
    });
  } catch (e) {
    // ignore emit errors
  }
}

const create = async ({ body, session = null }) => {
  const created = await dal.create(model, { body, session });

  // Real-time emit to the recipient user room whenever a new notification is saved.
  // Never fail the create call if socket emit/enrichment fails.
  await emitNotificationChange({ notificationId: created && created._id, action: 'new' });

  return created;
};

const findByIdAndUpdate = async ({ id, body, session = null }) => {
  const updated = await dal.findByIdAndUpdate(model, { id, body, session });
  await emitNotificationChange({ notificationId: updated && updated._id, action: 'update' });
  return updated;
};

const findOneAndUpdate = async ({
  filter, body, session = null, customOptions = {},
}) => {
  const updated = await dal.findOneAndUpdate(model, {
    filter,
    body,
    session,
    customOptions,
  });
  await emitNotificationChange({ notificationId: updated && updated._id, action: 'update' });
  return updated;
};

const find = async ({
  filter = {},
  pagination = {},
  sort = {},
  projection = {},
  populate = null,
  session = null,
}) => dal.find(model, {
  filter,
  pagination,
  sort,
  projection,
  populate,
  session,
});

const aggregate = async ({ query }) => dal.aggregate(model, { query });

/**
 * Update multiple notifications at once
 * @param {Object} options - { filter, body, session }
 * @returns {Promise<Object>} - { modifiedCount, matchedCount, ... }
 */
const updateMany = async ({ filter, body, session = null }) => {
  const result = await dal.updateMany(model, { filter, body, session });
  return result;
};

/**
 * Delete multiple notifications matching a filter
 * @param {Object} options - { filter, session }
 * @returns {Promise<Object>} - { deletedCount }
 */
const deleteMany = async ({ filter, session = null }) => {
  const result = await dal.deleteMany(model, { filter, session });
  return result;
};

/**
 * Count documents matching a filter
 * @param {Object} options - { filter, session }
 * @returns {Promise<number>} - Count of matching documents
 */
const countDocuments = async ({ filter, session = null }) => dal.countDocuments(model, { filter, session });

module.exports = {
  create,
  findByIdAndUpdate,
  findOneAndUpdate,
  find,
  aggregate,
  updateMany,
  deleteMany,
  countDocuments,
};
