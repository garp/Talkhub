const model = require('../models/chatroom.model');
const dal = require('../../lib/dal/dal');

// MONGODB SERVICES -----------------------------------------------------------
exports.findOne = async ({
  filter, projection = {}, populate = null, sort = {}, session = null,
}) => dal.findOne(model, {
  filter,
  projection,
  populate,
  sort,
  session,
});

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });

exports.create = async ({ body, session = null }) => dal.create(model, { body, session });

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, { id, body, session });

exports.findOneAndUpdate = async ({ filter, body, session = null }) => dal.findOneAndUpdate(model, { filter, body, session });

exports.find = async ({
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

function formatChatMessages(chatRooms) {
  return chatRooms.map((chatRoom) => {
    if (!chatRoom || !chatRoom._id || !Array.isArray(chatRoom.messages) || chatRoom.messages.length === 0) return;
    // Keep prompt bounded (avoid huge token usage)
    const lastMessages = chatRoom.messages.slice(-50);
    const prompt = `${lastMessages
      .map((message) => {
        const sender = message.senderFullName || 'Unknown';
        const timestamp = new Date(message.createdAt).toLocaleString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        return `[${timestamp}] ${sender}: ${message.content}`;
      })}\n`;

    return { chatroomId: chatRoom._id, prompt };
  });
}

exports.aggreateMessage = async ({ query, session = null }) => {
  const data = await dal.aggregate(model, { query, session });
  const formattedMessages = formatChatMessages(data);
  const filteredMessages = formattedMessages.filter((item) => item !== undefined);
  return { formattedMessages: filteredMessages, data };
};

exports.aggregate = async ({ query, session = null }) => dal.aggregate(model, { query, session });

exports.deleteOne = async ({ filter, session = null }) => (
  dal.deleteOne(model, { filter, session })
);
