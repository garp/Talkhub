const mongoose = require('mongoose');
const { socketEvents } = require('../../lib/constants/socket');
const messageServices = require('../services/messageServices');
const privateMessageServices = require('../services/privateMessageServices');
const chatroomServices = require('../services/chatroomServices');
const privateChatroomServices = require('../services/privateChatroomServices');
const participantServices = require('../services/participantServices');
const userServices = require('../services/userServices');

const toObjectId = (id) => {
  if (!id) return null;
  const str = String(id).trim();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

/**
 * Enrich readBy / deliveredTo arrays with user details (fullName, userName, profilePicture).
 * @param {Array<{ userId: ObjectId, readAt?: Date, deliveredAt?: Date }>} list
 * @returns {Promise<Array>}
 */
async function enrichWithUserDetails(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  const userIds = [...new Set(list.map((e) => e && e.userId).filter(Boolean))];
  if (userIds.length === 0) return list;

  const users = await userServices.find({
    filter: { _id: { $in: userIds } },
    projection: {
      _id: 1, fullName: 1, userName: 1, profilePicture: 1,
    },
  });
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return list.map((entry) => {
    const u = entry.userId ? userMap.get(String(entry.userId)) : null;
    return {
      userId: entry.userId,
      readAt: entry.readAt || undefined,
      deliveredAt: entry.deliveredAt || undefined,
      user: u ? {
        _id: u._id,
        fullName: u.fullName,
        userName: u.userName,
        profilePicture: u.profilePicture,
      } : null,
    };
  });
}

/**
 * Handle getMessageInfo: returns full message details for a single message (hashtag or private).
 * Client emits GET_MESSAGE_INFO with { messageId, chatType: 'hashtag' | 'private', chatroomId }.
 * Server responds with MESSAGE_INFO_SUCCESS (message with senderDetails, readBy, deliveredTo enriched)
 * or MESSAGE_INFO_FAILED.
 */
exports.handleGetMessageInfo = async (socket, data) => {
  try {
    const userId = socket.handshake.query?.userId;
    if (!userId) {
      socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Unauthorized' });
      return;
    }

    const { messageId, chatType, chatroomId } = data || {};
    const messageObjectId = toObjectId(messageId);
    const chatroomObjectId = toObjectId(chatroomId);

    if (!messageObjectId || !chatroomId || !chatType) {
      socket.emit(socketEvents.MESSAGE_INFO_FAILED, {
        message: 'messageId, chatType and chatroomId are required.',
      });
      return;
    }

    if (chatType !== 'hashtag' && chatType !== 'private') {
      socket.emit(socketEvents.MESSAGE_INFO_FAILED, {
        message: 'chatType must be "hashtag" or "private".',
      });
      return;
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Invalid user' });
      return;
    }

    let message;
    let senderDetails = null;

    if (chatType === 'hashtag') {
      const chatroom = await chatroomServices.findOne({
        filter: { _id: chatroomObjectId },
        projection: { _id: 1 },
      });
      if (!chatroom) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Chatroom not found.' });
        return;
      }

      const participant = await participantServices.findOne({
        filter: { userId: userObjectId, chatroomId: chatroomObjectId },
        projection: { _id: 1 },
      });
      if (!participant) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'You are not a participant of this chat.' });
        return;
      }

      message = await messageServices.findOne({
        filter: { _id: messageObjectId, chatroomId: chatroomObjectId },
      });
      if (!message) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Message not found.' });
        return;
      }
    } else {
      const chatroom = await privateChatroomServices.findById({ id: chatroomObjectId });
      if (!chatroom) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Chatroom not found.' });
        return;
      }

      const isParticipant = Array.isArray(chatroom.participants) && chatroom.participants.some(
        (p) => p && p.userId && String(p.userId) === String(userObjectId),
      );
      if (!isParticipant) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'You are not a participant of this chat.' });
        return;
      }

      message = await privateMessageServices.findOne({
        filter: { _id: messageObjectId, chatroomId: chatroomObjectId },
      });
      if (!message) {
        socket.emit(socketEvents.MESSAGE_INFO_FAILED, { message: 'Message not found.' });
        return;
      }
    }

    const { senderId } = message;
    if (senderId) {
      const sender = await userServices.findById({
        id: senderId,
      });
      if (sender) {
        senderDetails = {
          _id: sender._id,
          fullName: sender.fullName,
          userName: sender.userName,
          profilePicture: sender.profilePicture,
        };
      }
    }

    const [readByEnriched, deliveredToEnriched] = await Promise.all([
      enrichWithUserDetails(message.readBy || []),
      enrichWithUserDetails(message.deliveredTo || []),
    ]);

    const poll = message.poll ? { ...message.poll } : undefined;
    if (poll && poll.isQuiz && 'correctOptionId' in poll) delete poll.correctOptionId;

    const payload = {
      _id: message._id,
      chatroomId: message.chatroomId,
      senderId: message.senderId,
      senderDetails,
      content: message.content,
      messageType: message.messageType,
      media: message.media,
      location: message.location,
      poll,
      status: message.status,
      readBy: readByEnriched,
      deliveredTo: deliveredToEnriched,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      isDeleted: message.isDeleted,
      deletedBy: message.deletedBy,
      deletedAt: message.deletedAt,
      isForwarded: !!message.isForwarded,
      isMultipleTimesForwarded: !!message.isMultipleTimesForwarded,
      chatType,
    };

    socket.emit(socketEvents.MESSAGE_INFO_SUCCESS, {
      message: payload,
    });
  } catch (error) {
    socket.emit(socketEvents.MESSAGE_INFO_FAILED, {
      message: error.message || 'Failed to get message info.',
    });
  }
};
