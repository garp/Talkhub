const mongoose = require('mongoose');
const { socketEvents } = require('../../lib/constants/socket');

const chatroomServices = require('../services/chatroomServices');
const privateChatroomServices = require('../services/privateChatroomServices');
const participantServices = require('../services/participantServices');
const messageServices = require('../services/messageServices');
const privateMessageServices = require('../services/privateMessageServices');

const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));

const normalizeTypes = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return [String(raw).trim().toLowerCase()].filter(Boolean);
};

const extractUrls = (text = '') => {
  const s = typeof text === 'string' ? text : '';
  if (!s) return [];
  // Basic URL regex; returns http(s) links
  const matches = s.match(/https?:\/\/[^\s<>"')]+/g);
  return matches ? matches.map((u) => u.trim()).filter(Boolean) : [];
};

const isDocUrl = (url = '') => /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar)(\?|$)/i.test(String(url));

exports.handleGetFiles = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId = null,
      chatroomId = null,
      type = ['links', 'doc', 'media'],
      page = 1,
      limit = 50,
    } = data || {};

    if (!userId) {
      socket.emit(socketEvents.GET_FILES_FAILED, { message: 'Missing userId on socket.' });
      return;
    }

    if (!hashtagId && !chatroomId) {
      socket.emit(socketEvents.GET_FILES_FAILED, { message: 'Invalid data. hashtagId or chatroomId is required.' });
      return;
    }

    const types = normalizeTypes(type);
    const allowed = new Set(['links', 'doc', 'media']);
    const invalid = types.filter((t) => !allowed.has(t));
    if (invalid.length) {
      socket.emit(socketEvents.GET_FILES_FAILED, { message: `Invalid type(s): ${invalid.join(', ')}` });
      return;
    }

    const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), 200) : 50;
    const pagination = { skip: (safePage - 1) * safeLimit, limit: safeLimit };
    const sort = { createdAt: -1 };

    const userObjectId = toObjectId(userId);

    // Decide scope: hashtag chat vs private chatroom
    let scope = 'private';
    let effectiveChatroomId = chatroomId;
    let hashtag = null;

    if (hashtagId) {
      scope = 'hashtag';
      hashtag = String(hashtagId);
      const room = await chatroomServices.findOne({
        filter: { hashtagId: toObjectId(hashtagId) },
        projection: { _id: 1 },
      });
      if (!room) {
        socket.emit(socketEvents.GET_FILES_FAILED, { message: 'Hashtag chatroom not found.' });
        return;
      }
      effectiveChatroomId = room._id;

      // Require membership (consistent with normal history flow)
      const participant = await participantServices.findOne({
        filter: { userId: userObjectId, chatroomId: toObjectId(effectiveChatroomId) },
        projection: { _id: 1 },
      });
      if (!participant) {
        socket.emit(socketEvents.GET_FILES_FAILED, { message: 'User is not a participant of this hashtag chatroom.' });
        return;
      }
    } else {
      scope = 'private';
      const room = await privateChatroomServices.findOne({
        filter: {
          _id: toObjectId(chatroomId),
          participants: { $elemMatch: { userId: userObjectId, deletedForMe: { $ne: true } } },
        },
        projection: { _id: 1, isGroupChat: 1 },
      });
      if (!room) {
        socket.emit(socketEvents.GET_FILES_FAILED, { message: 'Chatroom not found or you are not a participant.' });
        return;
      }
      effectiveChatroomId = room._id;
    }

    const baseFilter = {
      chatroomId: toObjectId(effectiveChatroomId),
      isDeleted: false,
      deletedFor: { $ne: userObjectId },
    };

    const results = { links: [], doc: [], media: [] };

    if (types.includes('media')) {
      const mediaMsgs = scope === 'hashtag'
        ? await messageServices.find({
          filter: {
            ...baseFilter,
            messageType: { $in: ['image', 'video', 'audio'] },
            media: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, messageType: 1, media: 1, mediaAssetId: 1, createdAt: 1,
          },
        })
        : await privateMessageServices.find({
          filter: {
            ...baseFilter,
            messageType: { $in: ['image', 'video', 'audio'] },
            media: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, messageType: 1, media: 1, mediaAssetId: 1, createdAt: 1,
          },
        });
      results.media = (mediaMsgs || []).map((m) => ({
        messageId: m._id,
        senderId: m.senderId,
        messageType: m.messageType,
        url: m.media,
        mediaAssetId: m.mediaAssetId || null,
        createdAt: m.createdAt,
      }));
    }

    if (types.includes('doc')) {
      const docMsgs = scope === 'hashtag'
        ? await messageServices.find({
          filter: {
            ...baseFilter,
            messageType: 'file',
            media: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, messageType: 1, media: 1, mediaAssetId: 1, createdAt: 1,
          },
        })
        : await privateMessageServices.find({
          filter: {
            ...baseFilter,
            messageType: 'file',
            media: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, messageType: 1, media: 1, mediaAssetId: 1, createdAt: 1,
          },
        });

      // Some clients may send docs as regular media URLs; keep "file" as primary and also accept doc-like URLs.
      results.doc = (docMsgs || [])
        .filter((m) => m && m.media && (m.messageType === 'file' || isDocUrl(m.media)))
        .map((m) => ({
          messageId: m._id,
          senderId: m.senderId,
          messageType: m.messageType,
          url: m.media,
          mediaAssetId: m.mediaAssetId || null,
          createdAt: m.createdAt,
        }));
    }

    if (types.includes('links')) {
      const linkMsgs = scope === 'hashtag'
        ? await messageServices.find({
          filter: {
            ...baseFilter,
            content: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, content: 1, createdAt: 1,
          },
        })
        : await privateMessageServices.find({
          filter: {
            ...baseFilter,
            content: { $exists: true, $ne: '' },
          },
          pagination,
          sort,
          projection: {
            _id: 1, senderId: 1, content: 1, createdAt: 1,
          },
        });

      const out = [];
      (linkMsgs || []).forEach((m) => {
        const urls = extractUrls(m.content);
        urls.forEach((u) => {
          out.push({
            url: u,
            messageId: m._id,
            senderId: m.senderId,
            createdAt: m.createdAt,
          });
        });
      });
      results.links = out;
    }

    socket.emit(socketEvents.GET_FILES_SUCCESS, {
      scope,
      hashtagId: hashtag,
      chatroomId: String(effectiveChatroomId),
      types,
      metadata: { page: safePage, limit: safeLimit },
      results,
    });
  } catch (error) {
    socket.emit(socketEvents.GET_FILES_FAILED, {
      message: error && error.message ? error.message : 'Failed to get files.',
    });
  }
};
