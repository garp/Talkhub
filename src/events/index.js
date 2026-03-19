const { onConnection, onDisconnect } = require('./onConnection');
const { socketEvents } = require('../../lib/constants/socket');
const { logInfo } = require('../../lib/helpers/logger');
// const { test } = require('./testEvent');
const { verifySocketToken } = require('../../lib/middlewares/verifyToken.middleware');
const { setIO } = require('./socketInstance');
const {
  getNotificationsByType,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} = require('./notificationEvents');
const {
  handleJoinRoom,
  handleSubHashtagJoinRoom,
  handleSendMessage,
  handleEditMessage,
  handleEmojiReact,
  handleMessageCommentAdd,
  handleMessageCommentList,
  handleHashtagPollVote,
  handleHashtagPollVoteScoreGet,
  getHashtagChatroomList,
  getBroadcastList,
  getHashtagChatroomParticipantsList,
  hashtagChatAddAdmin,
  hashtagChatRemoveAdmin,
  hashtagChatAddModerator,
  hashtagChatRemoveModerator,
  hashtagChatAddParticipants,
  hashtagChatRemoveParticipants,
  hashtagChatDeleteMessage,
  hashtagChatDeleteMessages,
  handleGuestSeeMessages,
  handleDeleteMessage,
  handleHashtagUserTyping,
  handleHashtagMessageDelivered,
  handleHashtagMessageRead,
  handleMarkHashtagChatroomAsRead,
} = require('./chatroomEvents');
const {
  handleJoinPrivateChat,
  createPrivateChat,
  createPrivateGroupChat,
  handleSendPrivateMessage,
  handleSendStoryReply,
  handleEditPrivateMessage,
  handlePrivateEmojiReact,
  handlePrivatePollVote,
  handlePrivatePollVoteScoreGet,
  getPrivateChatroomList,
  getGroupList,
  privGroupAddParticipants,
  privGroupRemoveParticipants,
  privGroupRemoveModerator,
  privGroupAddModerator,
  privGroupAddAdmin,
  privGroupRemoveAdmin,
  // privGroupDeleteMessage,
  getPrivateChatroomParticipantsList,
  handleUserTyping,
  handleMessageDelivered,
  handleMessageRead,
  handleMarkChatroomAsRead,
  privateChatDeleteMessages,
} = require('./privateChatroomEvents');
const {
  checkPermissionForHashtagChat,
  checkPermissionForPrivateChat,
} = require('../../lib/middlewares/checkPermission.middleware');
const {
  handleHeartbeat,
  handleUserStatus,
} = require('./presenceEvents');
const {
  handleAddImpression,
} = require('./postEvents');
const { handleGetFiles } = require('./mediaFilesEvents');
const { handleGetMessageInfo } = require('./messageInfoEvents');
const {
  handleStoryFeedSubscribe,
  handleStoryView,
  handleStoryReaction,
  handleStoryDelete,
} = require('./storyEvents');
const {
  handleAIChatList,
  handleAIChatCreate,
  handleAIChatJoin,
  handleAIChatDelete,
  handleAIChatArchive,
  handleAIChatUpdateTitle,
  handleAIChatClearAll,
  handleAISendMessage,
  handleAIStopGeneration,
  handleAIRegenerateResponse,
} = require('./aiChatEvents');
const {
  handleVoiceChatStart,
  handleVoiceChatEnd,
  handleVoiceSessionUpdate,
  handleVoiceAudioAppend,
  handleVoiceAudioCommit,
  handleVoiceAudioClear,
  handleVoiceCreateResponse,
  handleVoiceInterrupt,
  handleVoiceSendText,
  handleVoiceSessionStatus,
  handleDisconnect: handleVoiceDisconnect,
} = require('./aiVoiceChatEvents');
const {
  handleActiveUsers,
  handleUserOnline,
  handleUserOffline,
} = require('./activeUsersEvents');
const { handleGetUnreadCounts } = require('./unreadCountsEvents');

exports.initializeSocketIO = (io) => {
  setIO(io);
  io.use((socket, next) => {
    verifySocketToken(socket, next);
  });

  io.on(socketEvents.CONNECTION, (socket) => {
    try {
      const userId = socket.handshake?.query?.userId || 'anonymous';
      logInfo(`[Socket] connection socketId=${socket.id} userId=${userId}`);

      onConnection(socket);
      // test(socket);

      // Log every incoming socket event (similar to morgan-body for API)
      socket.onAny((eventName, ...args) => {
        if (eventName === socketEvents.HEARTBEAT || eventName === socketEvents.USER_STATUS_GET) return; // skip high-frequency events
        const payloadPreview = args.length
          ? (typeof args[0] === 'object' && args[0] !== null && !Buffer.isBuffer(args[0])
            ? JSON.stringify(args[0]).slice(0, 300)
            : String(args[0]).slice(0, 300))
          : '';
        logInfo(`[Socket] event=${eventName} socketId=${socket.id} userId=${userId} ${payloadPreview ? `payload=${payloadPreview}` : ''}`);
      });

      socket.removeAllListeners(socketEvents.HASHTAG_CHAT_LIST);
      socket.on(socketEvents.HASHTAG_CHAT_LIST, async (data) => {
        await getHashtagChatroomList(socket, data);
      });
      // Legacy / alias: some clients emit lowercase-c variants
      socket.removeAllListeners(socketEvents.HASHTAG_CHAT_LIST_LEGACY);
      socket.on(socketEvents.HASHTAG_CHAT_LIST_LEGACY, async (data) => {
        await getHashtagChatroomList(socket, data);
      });

      socket.removeAllListeners(socketEvents.BROADCAST_LIST);
      socket.on(socketEvents.BROADCAST_LIST, async (data) => {
        await getBroadcastList(socket, data);
      });

      socket.removeAllListeners(socketEvents.HEARTBEAT);
      socket.on(socketEvents.HEARTBEAT, async (data) => {
        await handleHeartbeat(socket, data);
      });

      socket.removeAllListeners(socketEvents.USER_STATUS_GET);
      socket.on(socketEvents.USER_STATUS_GET, async (data) => {
        await handleUserStatus(socket, data);
      });

      socket.removeAllListeners(socketEvents.GET_NOTIFICATION);
      socket.on(socketEvents.GET_NOTIFICATION, async (data) => {
        await getNotificationsByType(socket, data);
      });

      // Mark single notification as read
      socket.removeAllListeners(socketEvents.MARK_NOTIFICATION_READ);
      socket.on(socketEvents.MARK_NOTIFICATION_READ, async (data) => {
        await markNotificationRead(socket, data);
      });

      // Mark all/multiple notifications as read
      socket.removeAllListeners(socketEvents.MARK_ALL_NOTIFICATIONS_READ);
      socket.on(socketEvents.MARK_ALL_NOTIFICATIONS_READ, async (data) => {
        await markAllNotificationsRead(socket, data);
      });

      // Get unread notification count
      socket.removeAllListeners(socketEvents.GET_UNREAD_NOTIFICATION_COUNT);
      socket.on(socketEvents.GET_UNREAD_NOTIFICATION_COUNT, async (data) => {
        await getUnreadNotificationCount(socket, data);
      });

      // Unread message counts (DM + public chat badges)
      socket.removeAllListeners(socketEvents.GET_UNREAD_COUNTS);
      socket.on(socketEvents.GET_UNREAD_COUNTS, async () => {
        await handleGetUnreadCounts(socket);
      });

      socket.removeAllListeners(socketEvents.GET_FILES);
      socket.on(socketEvents.GET_FILES, async (data) => {
        await handleGetFiles(socket, data);
      });

      socket.removeAllListeners(socketEvents.JOIN_ROOM);
      socket.on(socketEvents.JOIN_ROOM, async (data) => {
        await handleJoinRoom(socket, data);
      });

      socket.removeAllListeners(socketEvents.GET_MESSAGE_INFO);
      socket.on(socketEvents.GET_MESSAGE_INFO, async (data) => {
        await handleGetMessageInfo(socket, data);
      });

      socket.removeAllListeners(socketEvents.SUB_HASHTAG_JOIN_ROOM);
      socket.on(socketEvents.SUB_HASHTAG_JOIN_ROOM, async (data) => {
        console.log('SUB_HASHTAG_JOIN_ROOM ===>', data);
        await handleSubHashtagJoinRoom(socket, data);
      });

      socket.removeAllListeners(socketEvents.SEND_MESSAGE);
      socket.on(socketEvents.SEND_MESSAGE, async (data) => {
        // Hydrate hashtag RBAC info on socket (so broadcast send restriction can use socket.can()).
        try {
          await checkPermissionForHashtagChat(socket, data);
        } catch (e) {
          // ignore; handlers will fall back to legacy flags / deny if required
        }
        await handleSendMessage(socket, data);
      });

      socket.removeAllListeners(socketEvents.EDIT_MESSAGE);
      socket.on(socketEvents.EDIT_MESSAGE, async (data) => {
        await handleEditMessage(socket, data);
      });

      socket.removeAllListeners(socketEvents.DELETE_MESSAGE);
      socket.on(socketEvents.DELETE_MESSAGE, async (data) => {
        await handleDeleteMessage(socket, data);
      });

      socket.removeAllListeners(socketEvents.EMOJI_REACT);
      socket.on(socketEvents.EMOJI_REACT, async (data) => {
        await handleEmojiReact(socket, data);
      });

      // Broadcast message comments
      socket.removeAllListeners(socketEvents.MESSAGE_COMMENT_ADD);
      socket.on(socketEvents.MESSAGE_COMMENT_ADD, async (data) => {
        await handleMessageCommentAdd(socket, data);
      });

      socket.removeAllListeners(socketEvents.MESSAGE_COMMENT_LIST);
      socket.on(socketEvents.MESSAGE_COMMENT_LIST, async (data) => {
        await handleMessageCommentList(socket, data);
      });

      socket.removeAllListeners(socketEvents.POLL_VOTE);
      socket.on(socketEvents.POLL_VOTE, async (data) => {
        // Route poll votes based on identifiers (hashtagId for hashtag chats, chatroomId for private chats)
        if (data && data.hashtagId) {
          await handleHashtagPollVote(socket, data);
          return;
        }
        if (data && data.chatroomId) {
          await handlePrivatePollVote(socket, data);
          return;
        }
        socket.emit(socketEvents.POLL_VOTE_FAILED, { message: 'Invalid data. hashtagId or chatroomId is required.' });
      });

      socket.removeAllListeners(socketEvents.POLL_UNVOTE);
      socket.on(socketEvents.POLL_UNVOTE, async (data) => {
        // Unvote is implemented as vote with empty selection; handler supports it.
        const forwarded = { ...(data || {}), selectedOptionIds: [] };
        if (forwarded && forwarded.hashtagId) {
          await handleHashtagPollVote(socket, forwarded);
          return;
        }
        if (forwarded && forwarded.chatroomId) {
          await handlePrivatePollVote(socket, forwarded);
          return;
        }
        socket.emit(socketEvents.POLL_UNVOTE_FAILED, { message: 'Invalid data. hashtagId or chatroomId is required.' });
      });

      socket.removeAllListeners(socketEvents.POLL_VOTE_SCORE_GET);
      socket.on(socketEvents.POLL_VOTE_SCORE_GET, async (data) => {
        if (data && data.hashtagId) {
          await handleHashtagPollVoteScoreGet(socket, data);
          return;
        }
        if (data && data.chatroomId) {
          await handlePrivatePollVoteScoreGet(socket, data);
          return;
        }
        socket.emit(socketEvents.POLL_VOTE_SCORE_FAILED, { message: 'Invalid data. hashtagId or chatroomId is required.' });
      });

      socket.on(socketEvents.HASHTAG_CHAT_ADD_ADMIN, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatAddAdmin(socket, data);
      });

      socket.on(socketEvents.HASHTAG_CHAT_REMOVE_ADMIN, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatRemoveAdmin(socket, data);
      });

      socket.on(socketEvents.GUEST_MESSAGE_HISTORY, async (data) => {
        await handleGuestSeeMessages(socket, data);
      });
      socket.on(socketEvents.HASHTAG_CHAT_ADD_MODERATOR, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        await hashtagChatAddModerator(socket, data);
      });

      socket.on(socketEvents.HASHTAG_CHAT_REMOVE_MODERATOR, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatRemoveModerator(socket, data);
      });

      socket.removeAllListeners(socketEvents.HASHTAG_CHAT_ADD_PARTICIPANTS);
      socket.on(socketEvents.HASHTAG_CHAT_ADD_PARTICIPANTS, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatAddParticipants(socket, data);
      });

      socket.on(socketEvents.HASHTAG_CHAT_REMOVE_PARTICIPANTS, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatRemoveParticipants(socket, data);
      });

      socket.on(socketEvents.HASHTAG_CHAT_DELETE_MESSAGE, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatDeleteMessage(socket, data);
      });

      socket.on(socketEvents.HASHTAG_CHAT_DELETE_MESSAGES, async (data) => {
        await checkPermissionForHashtagChat(socket, data);
        hashtagChatDeleteMessages(socket, data);
      });

      socket.removeAllListeners(socketEvents.PRIVATE_CHAT_LIST);
      socket.on(socketEvents.PRIVATE_CHAT_LIST, async (data) => {
        await getPrivateChatroomList(socket, data);
      });

      socket.removeAllListeners(socketEvents.GROUP_LIST);
      socket.on(socketEvents.GROUP_LIST, async (data) => {
        await getGroupList(socket, data);
      });

      socket.removeAllListeners(socketEvents.PRIVATE_CHAT_CREATE);
      socket.on(socketEvents.PRIVATE_CHAT_CREATE, async (data) => {
        await createPrivateChat(socket, data);
      });

      socket.removeAllListeners(socketEvents.JOIN_PRIVATE_ROOM);
      socket.on(socketEvents.JOIN_PRIVATE_ROOM, async (data) => {
        await handleJoinPrivateChat(socket, data);
      });

      socket.removeAllListeners(socketEvents.SEND_PRIVATE_MESSAGE);
      socket.on(socketEvents.SEND_PRIVATE_MESSAGE, async (data) => {
        await handleSendPrivateMessage(socket, data);
      });

      socket.removeAllListeners(socketEvents.SEND_STORY_REPLY);
      socket.on(socketEvents.SEND_STORY_REPLY, async (data) => {
        await handleSendStoryReply(socket, data);
      });

      // ─────────────────────────────────────────────────────────────
      // Stories Events (Instagram-like)
      // ─────────────────────────────────────────────────────────────
      socket.removeAllListeners(socketEvents.STORY_FEED_SUBSCRIBE);
      socket.on(socketEvents.STORY_FEED_SUBSCRIBE, async (data) => {
        await handleStoryFeedSubscribe(socket, data);
      });

      socket.removeAllListeners(socketEvents.STORY_VIEW);
      socket.on(socketEvents.STORY_VIEW, async (data) => {
        await handleStoryView(socket, data);
      });

      socket.removeAllListeners(socketEvents.STORY_REACTION);
      socket.on(socketEvents.STORY_REACTION, async (data) => {
        await handleStoryReaction(socket, data);
      });

      socket.removeAllListeners(socketEvents.STORY_DELETE);
      socket.on(socketEvents.STORY_DELETE, async (data) => {
        await handleStoryDelete(socket, data);
      });

      socket.removeAllListeners(socketEvents.EDIT_PRIVATE_MESSAGE);
      socket.on(socketEvents.EDIT_PRIVATE_MESSAGE, async (data) => {
        await handleEditPrivateMessage(socket, data);
      });

      socket.removeAllListeners(socketEvents.PRIV_EMOJI_REACT);
      socket.on(socketEvents.PRIV_EMOJI_REACT, async (data) => {
        await handlePrivateEmojiReact(socket, data);
      });

      socket.removeAllListeners(socketEvents.GROUP_CHAT_CREATE);
      socket.on(socketEvents.GROUP_CHAT_CREATE, async (data) => {
        await createPrivateGroupChat(socket, data);
      });

      // Private group: participants management (WhatsApp-like)
      socket.on(socketEvents.PRIVATE_GROUP_ADD_PARTICIPANTS, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupAddParticipants(socket, data);
      });

      socket.on(socketEvents.PRIVATE_GROUP_REMOVE_PARTICIPANTS, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupRemoveParticipants(socket, data);
      });

      // Backward compatible single-user events (some clients use these)
      socket.on(socketEvents.PRIVATE_GROUP_ADD_PARTICIPANT, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupAddParticipants(socket, {
          ...data,
          participantsToAdd: data.participantsToAdd || (data.participantToAdd ? [data.participantToAdd] : data.participantsToAdd),
        });
      });

      socket.on(socketEvents.PRIVATE_GROUP_REMOVE_PARTICIPANT, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupRemoveParticipants(socket, {
          ...data,
          participantsToRemove: data.participantsToRemove || (data.participantToRemove ? [data.participantToRemove] : data.participantsToRemove),
        });
      });

      socket.on(socketEvents.PRIVATE_GROUP_REMOVE_MODERATOR, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupRemoveModerator(socket, data);
      });

      socket.on(socketEvents.PRIVATE_GROUP_ADD_MODERATOR, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupAddModerator(socket, data);
      });

      socket.removeAllListeners(socketEvents.PRIVATE_GROUP_ADD_ADMIN);
      socket.on(socketEvents.PRIVATE_GROUP_ADD_ADMIN, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupAddAdmin(socket, data);
      });

      socket.on(socketEvents.PRIVATE_GROUP_REMOVE_ADMIN, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privGroupRemoveAdmin(socket, data);
      });

      socket.on(socketEvents.GET_PRIVATE_CHATROOM_PARTICIPANTS, async (data) => {
        getPrivateChatroomParticipantsList(socket, data);
      });

      socket.on(socketEvents.GET_HASHTAG_CHATROOM_PARTICIPANTS, async (data) => {
        getHashtagChatroomParticipantsList(socket, data);
      });

      // socket.on(socketEvents.PRIVATE_GROUP_DELETE_MESSAGE, async (data) => {
      //   privGroupDeleteMessage(socket, data);
      // });

      socket.on(socketEvents.PRIVATE_CHAT_DELETE_MESSAGES, async (data) => {
        await checkPermissionForPrivateChat(socket, data);
        privateChatDeleteMessages(socket, data);
      });

      // Typing Indicator Events - Private Chat
      socket.removeAllListeners(socketEvents.USER_TYPING);
      socket.on(socketEvents.USER_TYPING, async (data) => {
        await handleUserTyping(socket, data);
      });

      // Typing Indicator Events - Hashtag Chat
      socket.removeAllListeners(socketEvents.HASHTAG_USER_TYPING);
      socket.on(socketEvents.HASHTAG_USER_TYPING, async (data) => {
        await handleHashtagUserTyping(socket, data);
      });

      // Message Status Events - Private Chat
      socket.removeAllListeners(socketEvents.MESSAGE_DELIVERED);
      socket.on(socketEvents.MESSAGE_DELIVERED, async (data) => {
        await handleMessageDelivered(socket, data);
      });

      socket.removeAllListeners(socketEvents.MESSAGE_READ);
      socket.on(socketEvents.MESSAGE_READ, async (data) => {
        await handleMessageRead(socket, data);
      });

      socket.removeAllListeners(socketEvents.MARK_CHATROOM_AS_READ);
      socket.on(socketEvents.MARK_CHATROOM_AS_READ, async (data) => {
        await handleMarkChatroomAsRead(socket, data);
      });

      // Message Status Events - Hashtag Chat
      socket.removeAllListeners(socketEvents.HASHTAG_MESSAGE_DELIVERED);
      socket.on(socketEvents.HASHTAG_MESSAGE_DELIVERED, async (data) => {
        await handleHashtagMessageDelivered(socket, data);
      });

      socket.removeAllListeners(socketEvents.HASHTAG_MESSAGE_READ);
      socket.on(socketEvents.HASHTAG_MESSAGE_READ, async (data) => {
        await handleHashtagMessageRead(socket, data);
      });

      socket.removeAllListeners(socketEvents.MARK_HASHTAG_CHATROOM_AS_READ);
      socket.on(socketEvents.MARK_HASHTAG_CHATROOM_AS_READ, async (data) => {
        await handleMarkHashtagChatroomAsRead(socket, data);
      });

      // Post Impression Events
      socket.removeAllListeners(socketEvents.ADD_IMPRESSION);
      socket.on(socketEvents.ADD_IMPRESSION, async (data) => {
        await handleAddImpression(socket, data);
      });

      // ─────────────────────────────────────────────────────────────
      // AI Chat Events (ChatGPT-like conversational AI)
      // ─────────────────────────────────────────────────────────────

      // Get conversation list
      socket.removeAllListeners(socketEvents.AI_CHAT_LIST);
      socket.on(socketEvents.AI_CHAT_LIST, async (data) => {
        await handleAIChatList(socket, data);
      });

      // Create new conversation
      socket.removeAllListeners(socketEvents.AI_CHAT_CREATE);
      socket.on(socketEvents.AI_CHAT_CREATE, async (data) => {
        await handleAIChatCreate(socket, data);
      });

      // Join/load conversation with message history
      socket.removeAllListeners(socketEvents.AI_CHAT_JOIN);
      socket.on(socketEvents.AI_CHAT_JOIN, async (data) => {
        await handleAIChatJoin(socket, data);
      });

      // Delete conversation
      socket.removeAllListeners(socketEvents.AI_CHAT_DELETE);
      socket.on(socketEvents.AI_CHAT_DELETE, async (data) => {
        await handleAIChatDelete(socket, data);
      });

      // Archive/unarchive conversation
      socket.removeAllListeners(socketEvents.AI_CHAT_ARCHIVE);
      socket.on(socketEvents.AI_CHAT_ARCHIVE, async (data) => {
        await handleAIChatArchive(socket, data);
      });

      // Update conversation title
      socket.removeAllListeners(socketEvents.AI_CHAT_UPDATE_TITLE);
      socket.on(socketEvents.AI_CHAT_UPDATE_TITLE, async (data) => {
        await handleAIChatUpdateTitle(socket, data);
      });

      // Clear all conversations
      socket.removeAllListeners(socketEvents.AI_CHAT_CLEAR_ALL);
      socket.on(socketEvents.AI_CHAT_CLEAR_ALL, async (data) => {
        await handleAIChatClearAll(socket, data);
      });

      // Send message to AI (with streaming response)
      socket.removeAllListeners(socketEvents.AI_SEND_MESSAGE);
      socket.on(socketEvents.AI_SEND_MESSAGE, async (data) => {
        await handleAISendMessage(socket, data);
      });

      // Stop AI generation
      socket.removeAllListeners(socketEvents.AI_STOP_GENERATION);
      socket.on(socketEvents.AI_STOP_GENERATION, async (data) => {
        await handleAIStopGeneration(socket, data);
      });

      // Regenerate last response
      socket.removeAllListeners(socketEvents.AI_REGENERATE);
      socket.on(socketEvents.AI_REGENERATE, async (data) => {
        await handleAIRegenerateResponse(socket, data);
      });

      // ─────────────────────────────────────────────────────────────
      // AI Voice Chat Events (Real-time Voice Conversation)
      // ─────────────────────────────────────────────────────────────

      // Start voice chat session
      socket.removeAllListeners(socketEvents.VOICE_CHAT_START);
      socket.on(socketEvents.VOICE_CHAT_START, async (data) => {
        await handleVoiceChatStart(socket, data);
      });

      // End voice chat session
      socket.removeAllListeners(socketEvents.VOICE_CHAT_END);
      socket.on(socketEvents.VOICE_CHAT_END, () => {
        handleVoiceChatEnd(socket);
      });

      // Update voice session configuration
      socket.removeAllListeners(socketEvents.VOICE_SESSION_UPDATE);
      socket.on(socketEvents.VOICE_SESSION_UPDATE, (data) => {
        handleVoiceSessionUpdate(socket, data);
      });

      // Get voice session status
      socket.removeAllListeners(socketEvents.VOICE_SESSION_STATUS);
      socket.on(socketEvents.VOICE_SESSION_STATUS, () => {
        handleVoiceSessionStatus(socket);
      });

      // Append audio chunk
      socket.removeAllListeners(socketEvents.VOICE_AUDIO_APPEND);
      socket.on(socketEvents.VOICE_AUDIO_APPEND, (data) => {
        handleVoiceAudioAppend(socket, data);
      });

      // Commit audio buffer (manual VAD)
      socket.removeAllListeners(socketEvents.VOICE_AUDIO_COMMIT);
      socket.on(socketEvents.VOICE_AUDIO_COMMIT, () => {
        handleVoiceAudioCommit(socket);
      });

      // Clear audio buffer
      socket.removeAllListeners(socketEvents.VOICE_AUDIO_CLEAR);
      socket.on(socketEvents.VOICE_AUDIO_CLEAR, () => {
        handleVoiceAudioClear(socket);
      });

      // Manually trigger response (manual VAD)
      socket.removeAllListeners(socketEvents.VOICE_CREATE_RESPONSE);
      socket.on(socketEvents.VOICE_CREATE_RESPONSE, () => {
        handleVoiceCreateResponse(socket);
      });

      // Interrupt AI response
      socket.removeAllListeners(socketEvents.VOICE_INTERRUPT);
      socket.on(socketEvents.VOICE_INTERRUPT, () => {
        handleVoiceInterrupt(socket);
      });

      // Send text message in voice session (hybrid mode)
      socket.removeAllListeners(socketEvents.VOICE_SEND_TEXT);
      socket.on(socketEvents.VOICE_SEND_TEXT, (data) => {
        handleVoiceSendText(socket, data);
      });

      // ─────────────────────────────────────────────────────────────
      // Active Users Events (Real-time online user counts)
      // ─────────────────────────────────────────────────────────────

      // Get active users for a chatroom
      socket.removeAllListeners(socketEvents.ACTIVE_USERS);
      socket.on(socketEvents.ACTIVE_USERS, async (data) => {
        await handleActiveUsers(socket, data);
      });

      // Mark user as online when connected
      if (userId && userId !== 'anonymous') {
        handleUserOnline(userId);
      }

      socket.on(socketEvents.DISCONNECT, () => {
        logInfo(`[Socket] disconnect socketId=${socket.id} userId=${userId}`);
        // Mark user as offline
        if (userId && userId !== 'anonymous') {
          handleUserOffline(userId);
        }
        handleVoiceDisconnect(socket); // Cleanup voice session
        onDisconnect(socket);
      });
    } catch (error) {
      socket.emit(
        socketEvents.PAIR_FAILED,
        error && error.message ? error.message : 'Something went wrong while connecting to the socket.',
      );
    }
  });
};

exports.emitSocketEvent = (req, roomId, event, payload) => {
  req.app.get('io').in(roomId).emit(event, payload);
};
