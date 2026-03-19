exports.socketEvents = {
  TEST: 'test',
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  USER_DISCONNECTED: 'userDisconnected',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeatAck',
  USER_STATUS_GET: 'userStatusGet',
  USER_STATUS_RESULT: 'userStatusResult',
  GET_NOTIFICATION: 'getNotification',
  GET_NOTIFICATION_SUCCESS: 'getNotificationSuccess',
  GET_NOTIFICATION_FAILED: 'getNotificationFailed',

  // Mark notification as read/seen
  MARK_NOTIFICATION_READ: 'markNotificationRead',
  MARK_NOTIFICATION_READ_SUCCESS: 'markNotificationReadSuccess',
  MARK_NOTIFICATION_READ_FAILED: 'markNotificationReadFailed',

  // Mark all notifications as read
  MARK_ALL_NOTIFICATIONS_READ: 'markAllNotificationsRead',
  MARK_ALL_NOTIFICATIONS_READ_SUCCESS: 'markAllNotificationsReadSuccess',
  MARK_ALL_NOTIFICATIONS_READ_FAILED: 'markAllNotificationsReadFailed',

  // Get unread notification count
  GET_UNREAD_NOTIFICATION_COUNT: 'getUnreadNotificationCount',
  GET_UNREAD_NOTIFICATION_COUNT_SUCCESS: 'getUnreadNotificationCountSuccess',
  GET_UNREAD_NOTIFICATION_COUNT_FAILED: 'getUnreadNotificationCountFailed',

  // Unread message counts (DM + public chat badges)
  GET_UNREAD_COUNTS: 'getUnreadCounts',
  UNREAD_COUNTS_SUCCESS: 'unreadCountsSuccess',
  UNREAD_COUNTS_UPDATE: 'unreadCountsUpdate',

  // Real-time notification read update (broadcast to user)
  NOTIFICATION_READ_UPDATE: 'notificationReadUpdate',
  // Media/files browser (links/docs/media) for hashtag chats and private chatrooms
  GET_FILES: 'getFiles',
  GET_FILES_SUCCESS: 'getFilesSuccess',
  GET_FILES_FAILED: 'getFilesFailed',
  PAIR_FAILED: 'pairFailed',
  PAIR_SUCCESS: 'pairSuccess',
  USER_JOINED: 'userJoined',
  HASHTAG_CHAT_LIST: 'hashtagChatList',
  HASHTAG_CHAT_LIST_SUCCESS: 'hashtagChatListSuccess',
  HASHTAG_CHAT_LIST_FAILED: 'hashtagChatListFailed',
  BROADCAST_LIST: 'broadcastList',
  BROADCAST_LIST_SUCCESS: 'broadcastListSuccess',
  BROADCAST_LIST_FAILED: 'broadcastListFailed',
  // Legacy / alias event names (some clients emit lowercase-c variants)
  HASHTAG_CHAT_LIST_LEGACY: 'hashtagchatlist',
  HASHTAG_CHAT_LIST_SUCCESS_LEGACY: 'hashtagchatlistSuccess',
  HASHTAG_CHAT_LIST_FAILED_LEGACY: 'hashtagchatlistFailed',
  JOIN_ROOM: 'joinRoom',
  JOIN_ROOM_SUCCESS: 'joinRoomSuccess',
  JOIN_ROOM_FAILED: 'joinRoomFailed',
  SUB_HASHTAG_JOIN_ROOM: 'subHashtagJoinRoom',
  SUB_HASHTAG_JOIN_ROOM_SUCCESS: 'subHashtagJoinRoomSuccess',
  SUB_HASHTAG_JOIN_ROOM_FAILED: 'subHashtagJoinRoomFailed',
  MESSAGE_HISTORY: 'messageHistory',
  GET_MESSAGE_INFO: 'getMessageInfo',
  MESSAGE_INFO_SUCCESS: 'messageInfoSuccess',
  MESSAGE_INFO_FAILED: 'messageInfoFailed',
  SEND_MESSAGE: 'sendMessage',
  SEND_MESSAGE_SUCCESS: 'sendMessageSuccess',
  SEND_MESSAGE_FAILED: 'sendMessageFailed',
  DELETE_MESSAGE: 'deleteMessage',
  DELETE_MESSAGE_SUCCESS: 'deleteMessageSuccess',
  DELETE_MESSAGE_FAILED: 'deleteMessageFailed',
  // Bulk delete (WhatsApp-style)
  DELETE_MESSAGES: 'deleteMessages',
  DELETE_MESSAGES_SUCCESS: 'deleteMessagesSuccess',
  DELETE_MESSAGES_FAILED: 'deleteMessagesFailed',
  NEW_MESSAGE: 'newMessage',
  EDIT_MESSAGE: 'editMessage',
  EDIT_MESSAGE_SUCCESS: 'editMessageSuccess',
  EDIT_MESSAGE_FAILED: 'editMessageFailed',
  MESSAGE_EDITED: 'messageEdited',
  EMOJI_REACT: 'emojiReact',
  EMOJI_REACT_SUCCESS: 'emojiReactSuccess',
  EMOJI_REACT_FAILED: 'emojiReactFailed',
  // Message Comments (Broadcast hashtags)
  MESSAGE_COMMENT_ADD: 'messageCommentAdd',
  MESSAGE_COMMENT_ADD_SUCCESS: 'messageCommentAddSuccess',
  MESSAGE_COMMENT_ADD_FAILED: 'messageCommentAddFailed',
  MESSAGE_COMMENT_ADDED: 'messageCommentAdded',
  MESSAGE_COMMENT_LIST: 'messageCommentList',
  MESSAGE_COMMENT_LIST_SUCCESS: 'messageCommentListSuccess',
  MESSAGE_COMMENT_LIST_FAILED: 'messageCommentListFailed',
  // Polls (WhatsApp-style)
  POLL_VOTE: 'pollVote',
  POLL_VOTE_SUCCESS: 'pollVoteSuccess',
  POLL_VOTE_FAILED: 'pollVoteFailed',
  POLL_UNVOTE: 'pollUnvote',
  POLL_UNVOTE_SUCCESS: 'pollUnvoteSuccess',
  POLL_UNVOTE_FAILED: 'pollUnvoteFailed',
  POLL_UPDATED: 'pollUpdated',
  // Alias event name (some clients prefer "updateVotes"-style naming)
  POLL_UPDATE_VOTES: 'pollUpdateVotes',
  POLL_VOTE_SCORE_GET: 'pollVoteScoreGet',
  POLL_VOTE_SCORE_SUCCESS: 'pollVoteScoreSuccess',
  POLL_VOTE_SCORE_FAILED: 'pollVoteScoreFailed',
  // Realtime delta update for voteScore screens (non-anonymous polls only)
  POLL_VOTE_SCORE_UPDATED: 'pollVoteScoreUpdated',
  PRIVATE_CHAT_LIST: 'privateChatList',
  PRIVATE_CHAT_LIST_SUCCESS: 'privateChatListSuccess',
  PRIVATE_CHAT_LIST_FAILED: 'privateChatListFailed',
  GROUP_LIST: 'groupList',
  GROUP_LIST_SUCCESS: 'groupListSuccess',
  GROUP_LIST_FAILED: 'groupListFailed',
  JOIN_PRIVATE_ROOM: 'joinPrivateRoom',
  NEW_PRIVATE_CHAT: 'newPrivateChat',
  PRIVATE_CHAT_CREATE: 'privateChatCreate',
  PRIVATE_CHAT_CREATE_SUCCESS: 'privateChatCreateSuccess',
  PRIVATE_CHAT_CREATE_FAILED: 'privateChatCreateFailed',
  USER_JOINED_PRIVATE_CHAT: 'userJoinedPrivateChat',
  PRIVATE_MESSAGE_HISTORY: 'privateMessageHistory',
  PRIVATE_CHAT_JOIN_FAILED: 'privateChatJoinFailed',
  NEW_PRIVATE_MESSAGE: 'newPrivateMessage',
  SEND_PRIVATE_MESSAGE: 'sendPrivateMessage',
  SEND_PRIVATE_MESSAGE_SUCCESS: 'sendPrivateMessageSuccess',
  SEND_PRIVATE_MESSAGE_FAILED: 'sendPrivateMessageFailed',
  // Story replies (Instagram-style): create/find 1:1 chat with story owner and send a DM containing story preview.
  SEND_STORY_REPLY: 'sendStoryReply',
  SEND_STORY_REPLY_SUCCESS: 'sendStoryReplySuccess',
  SEND_STORY_REPLY_FAILED: 'sendStoryReplyFailed',

  // ─────────────────────────────────────────────────────────────
  // Stories Events (Instagram-like)
  // ─────────────────────────────────────────────────────────────
  STORY_FEED_SUBSCRIBE: 'storyFeedSubscribe',
  STORY_FEED_SUBSCRIBE_SUCCESS: 'storyFeedSubscribeSuccess',
  STORY_FEED_SUBSCRIBE_FAILED: 'storyFeedSubscribeFailed',

  STORY_VIEW: 'storyView',
  STORY_VIEW_SUCCESS: 'storyViewSuccess',
  STORY_VIEW_FAILED: 'storyViewFailed',

  STORY_REACTION: 'storyReaction',
  STORY_REACTION_SUCCESS: 'storyReactionSuccess',
  STORY_REACTION_FAILED: 'storyReactionFailed',

  STORY_DELETE: 'storyDelete',
  STORY_DELETE_SUCCESS: 'storyDeleteSuccess',
  STORY_DELETE_FAILED: 'storyDeleteFailed',

  // Server push updates (keep payload small; clients pull full feed via HTTP)
  NEW_STORY_REEL: 'newStoryReel',
  STORY_REEL_UPDATED: 'storyReelUpdated',
  STORY_VIEWERS_UPDATED: 'storyViewersUpdated',
  STORY_REACTIONS_UPDATED: 'storyReactionsUpdated',
  EDIT_PRIVATE_MESSAGE: 'editPrivateMessage',
  EDIT_PRIVATE_MESSAGE_SUCCESS: 'editPrivateMessageSuccess',
  EDIT_PRIVATE_MESSAGE_FAILED: 'editPrivateMessageFailed',
  PRIVATE_MESSAGE_EDITED: 'privateMessageEdited',
  PRIV_EMOJI_REACT: 'privateEmojiReact',
  PRIV_EMOJI_REACT_SUCCESS: 'privateEmojiReactSuccess',
  PRIV_EMOJI_REACT_FAILED: 'privateEmojiReactFailed',
  GROUP_CHAT_CREATE: 'groupChatCreate',
  GROUP_CHAT_CREATE_SUCCESS: 'groupChatCreateSuccess',
  GROUP_CHAT_CREATE_FAILED: 'groupChatCreateFailed',
  NEW_GROUP_CHAT: 'newGroupChat',

  PRIVATE_GROUP_ADD_PARTICIPANT: 'privateGroupAddParticipant',
  PRIVATE_GROUP_ADD_PARTICIPANT_SUCCESS: 'privateGroupAddParticipantSuccess',
  PRIVATE_GROUP_ADD_PARTICIPANT_FAILED: 'privateGroupAddParticipantFailed',
  PRIVATE_GROUP_REMOVE_PARTICIPANT: 'privateGroupRemoveParticipant',

  PRIVATE_GROUP_REMOVE_MODERATOR: 'privateGroupRemoveModerator',
  PRIVATE_GROUP_MODERATOR_REMOVED: 'privateGroupModeratorRemoved',
  PRIVATE_GROUP_REMOVE_MODERATOR_FAILED: 'privateGroupRemoveModeratorFailed',
  PRIVATE_GROUP_REMOVE_MODERATOR_SUCCESS: 'privateGroupRemoveModeratorSuccess',

  PRIVATE_GROUP_ADD_MODERATOR: 'privateGroupAddModerator',
  PRIVATE_GROUP_ADD_MODERATOR_SUCCESS: 'privateGroupAddModeratorSuccess',
  PRIVATE_GROUP_ADD_MODERATOR_FAILED: 'privateGroupAddModeratorFailed',
  PRIVATE_GROUP_MODERATOR_ADDED: 'privateGroupModeratorAdded',

  PRIVATE_GROUP_ADD_ADMIN: 'privateGroupAddAdmin',
  PRIVATE_GROUP_ADMIN_ADDED: 'privateGroupAdminAdded',
  PRIVATE_GROUP_ADD_ADMIN_FAILED: 'privateGroupAddAdminFailed',
  PRIVATE_GROUP_ADD_ADMIN_SUCCESS: 'privateGroupAddAdminSuccess',

  PRIVATE_GROUP_REMOVE_ADMIN: 'privateGroupRemoveAdmin',
  PRIVATE_GROUP_ADMIN_REMOVED: 'privateGroupAdminRemoved',
  PRIVATE_GROUP_REMOVE_ADMIN_FAILED: 'privateGroupRemoveAdminFailed',
  PRIVATE_GROUP_REMOVE_ADMIN_SUCCESS: 'privateGroupRemoveAdminSuccess',

  GET_PRIVATE_CHATROOM_PARTICIPANTS: 'getPrivateChatroomParticipants',
  PRIVATE_CHATROOM_PARTICIPANTS_LIST_SUCCESS: 'privateChatroomParticipantsListSuccess',
  PRIVATE_CHATROOM_PARTICIPANTS_LIST_FAILED: 'privateChatroomParticipantsListFailed',

  GET_HASHTAG_CHATROOM_PARTICIPANTS: 'getHashtagChatroomParticipants',
  HASHTAG_CHATROOM_PARTICIPANTS_LIST_SUCCESS: 'hashtagChatroomParticipantsListSuccess',
  HASHTAG_CHATROOM_PARTICIPANTS_LIST_FAILED: 'hashtagChatroomParticipantsListFailed',

  HASHTAG_CHAT_ADD_ADMIN: 'hashtagChatAddAdmin',
  HASHTAG_CHAT_ADMIN_ADDED: 'hashtagChatAdminAdded',
  HASHTAG_CHAT_ADD_ADMIN_FAILED: 'hashtagChatAddAdminFailed',
  HASHTAG_CHAT_ADD_ADMIN_SUCCESS: 'hashtagChatAddAdminSuccess',

  HASHTAG_CHAT_REMOVE_ADMIN: 'hashtagChatRemoveAdmin',
  HASHTAG_CHAT_ADMIN_REMOVED: 'hashtagChatAdminRemoved',
  HASHTAG_CHAT_REMOVE_ADMIN_FAILED: 'hashtagChatRemoveAdminFailed',
  HASHTAG_CHAT_REMOVE_ADMIN_SUCCESS: 'hashtagChatRemoveAdminFailed',

  HASHTAG_CHAT_ADD_MODERATOR: 'hashtagChatAddModerator',
  HASHTAG_CHAT_MODERATOR_ADDED: 'hashtagChatModeratorAdded',
  HASHTAG_CHAT_ADD_MODERATOR_FAILED: 'hashtagChatAddModeratorFailed',
  HASHTAG_CHAT_ADD_MODERATOR_SUCCESS: 'hashtagChatAddModeratorSuccess',

  HASHTAG_CHAT_REMOVE_MODERATOR: 'hashtagChatRemoveModerator',
  HASHTAG_CHAT_MODERATOR_REMOVED: 'hashtagChatModeratorRemoved',
  HASHTAG_CHAT_REMOVE_MODERATOR_FAILED: 'hashtagChatRemoveModeratorFailed',
  HASHTAG_CHAT_REMOVE_MODERATOR_SUCCESS: 'hashtagChatRemoveModeratorSuccess',

  HASHTAG_CHAT_ADD_PARTICIPANTS: 'hashtagChatAddParticipants',
  HASHTAG_CHAT_PARTICIPANTS_ADDED: 'hashtagChatParticipantsAdded',
  HASHTAG_CHAT_ADD_PARTICIPANTS_FAILED: 'hashtagChatAddParticipantsFailed',
  HASHTAG_CHAT_ADD_PARTICIPANTS_SUCCESS: 'hashtagChatAddParticipantsSuccess',

  HASHTAG_CHAT_REMOVE_PARTICIPANTS: 'hashtagChatRemoveParticipants',
  HASHTAG_CHAT_PARTICIPANTS_REMOVED: 'hashtagChatParticipantsRemoved',
  HASHTAG_CHAT_REMOVE_PARTICIPANTS_FAILED: 'hashtagChatRemoveParticipantsFailed',
  HASHTAG_CHAT_REMOVE_PARTICIPANTS_SUCCESS: 'hashtagChatRemoveParticipantsSuccess',

  HASHTAG_CHAT_DELETE_MESSAGE: 'hashtagChatDeleteMessage',
  HASHTAG_CHAT_MESSAGE_DELETED: 'hashtagChatMessageDeleted',
  HASHTAG_CHAT_MESSAGE_DELETE_FAILED: 'hashtagChatDeleteMessageFailed',
  HASHTAG_CHAT_MESSAGE_DELETE_SUCCESS: 'hashtagChatDeleteMessageSuccess',
  HASHTAG_CHAT_DELETE_MESSAGES: 'hashtagChatDeleteMessages',
  HASHTAG_CHAT_MESSAGES_DELETED: 'hashtagChatMessagesDeleted',
  HASHTAG_CHAT_DELETE_MESSAGES_FAILED: 'hashtagChatDeleteMessagesFailed',
  HASHTAG_CHAT_DELETE_MESSAGES_SUCCESS: 'hashtagChatDeleteMessagesSuccess',

  PRIVATE_GROUP_ADD_PARTICIPANTS: 'privateGroupAddParticipants',
  PRIVATE_GROUP_PARTICIPANTS_ADDED: 'privateGroupParticipantsAdded',
  PRIVATE_GROUP_ADD_PARTICIPANTS_FAILED: 'privateGroupAddParticipantsFailed',
  PRIVATE_GROUP_ADD_PARTICIPANTS_SUCCESS: 'privateGroupAddParticipantsSuccess',

  PRIVATE_GROUP_REMOVE_PARTICIPANTS: 'privateGroupRemoveParticipants',
  PRIVATE_GROUP_PARTICIPANTS_REMOVED: 'privateGroupParticipantsRemoved',
  PRIVATE_GROUP_REMOVE_PARTICIPANTS_FAILED: 'privateGroupRemoveParticipantsFailed',
  PRIVATE_GROUP_REMOVE_PARTICIPANTS_SUCCESS: 'privateGroupRemoveParticipantsSuccess',

  PRIVATE_GROUP_DELETE_MESSAGE: 'privateGroupDeleteMessage', // not implemented
  PRIVATE_GROUP_MESSAGE_DELETED: 'privateGroupMessageDeleted', // not implemented
  PRIVATE_GROUP_MESSAGE_DELETE_FAILED: 'privateGroupDeleteMessageFailed', // not implemented
  PRIVATE_GROUP_MESSAGE_DELETE_SUCCESS: 'privateGroupDeleteMessageSuccess', // not implemented

  PRIVATE_CHAT_DELETE_MESSAGES: 'privateChatDeleteMessages',
  PRIVATE_CHAT_MESSAGES_DELETED: 'privateChatMessagesDeleted',
  PRIVATE_CHAT_DELETE_MESSAGES_FAILED: 'privateChatDeleteMessagesFailed',
  PRIVATE_CHAT_DELETE_MESSAGES_SUCCESS: 'privateChatDeleteMessagesSuccess',

  GUEST_MESSAGE_HISTORY: 'guestMessageHistory',
  GUEST_MESSAGE_HISTORY_SUCCESS: 'guestMessageHistorySuccess',
  GUEST_MESSAGE_HISTORY_FAILED: 'guestMessageHistoryFailed',

  // Typing Indicator Events
  USER_TYPING: 'userTyping',
  USER_TYPING_UPDATE: 'userTypingUpdate',
  USER_TYPING_FAILED: 'userTypingFailed',

  HASHTAG_USER_TYPING: 'hashtagUserTyping',
  HASHTAG_USER_TYPING_UPDATE: 'hashtagUserTypingUpdate',
  HASHTAG_USER_TYPING_FAILED: 'hashtagUserTypingFailed',

  // Message Status Events - Private Chat
  MESSAGE_DELIVERED: 'messageDelivered',
  MESSAGE_DELIVERED_SUCCESS: 'messageDeliveredSuccess',
  MESSAGE_DELIVERED_UPDATE: 'messageDeliveredUpdate',
  MESSAGE_DELIVERED_FAILED: 'messageDeliveredFailed',

  MESSAGE_READ: 'messageRead',
  MESSAGE_READ_SUCCESS: 'messageReadSuccess',
  MESSAGE_READ_UPDATE: 'messageReadUpdate',
  MESSAGE_READ_FAILED: 'messageReadFailed',

  MARK_CHATROOM_AS_READ: 'markChatroomAsRead',
  CHATROOM_MESSAGES_READ: 'chatroomMessagesRead',
  MARK_CHATROOM_AS_READ_SUCCESS: 'markChatroomAsReadSuccess',
  MARK_CHATROOM_AS_READ_FAILED: 'markChatroomAsReadFailed',

  // Message Status Events - Hashtag Chat
  HASHTAG_MESSAGE_DELIVERED: 'hashtagMessageDelivered',
  HASHTAG_MESSAGE_DELIVERED_SUCCESS: 'hashtagMessageDeliveredSuccess',
  HASHTAG_MESSAGE_DELIVERED_UPDATE: 'hashtagMessageDeliveredUpdate',
  HASHTAG_MESSAGE_DELIVERED_FAILED: 'hashtagMessageDeliveredFailed',

  HASHTAG_MESSAGE_READ: 'hashtagMessageRead',
  HASHTAG_MESSAGE_READ_SUCCESS: 'hashtagMessageReadSuccess',
  HASHTAG_MESSAGE_READ_UPDATE: 'hashtagMessageReadUpdate',
  HASHTAG_MESSAGE_READ_FAILED: 'hashtagMessageReadFailed',

  MARK_HASHTAG_CHATROOM_AS_READ: 'markHashtagChatroomAsRead',
  HASHTAG_CHATROOM_MESSAGES_READ: 'hashtagChatroomMessagesRead',
  MARK_HASHTAG_CHATROOM_AS_READ_SUCCESS: 'markHashtagChatroomAsReadSuccess',
  MARK_HASHTAG_CHATROOM_AS_READ_FAILED: 'markHashtagChatroomAsReadFailed',

  // Post Impression Events
  ADD_IMPRESSION: 'addImpression',
  ADD_IMPRESSION_SUCCESS: 'addImpressionSuccess',
  ADD_IMPRESSION_FAILED: 'addImpressionFailed',
  IMPRESSION_ADDED: 'impressionAdded',

  // Feed Events (real-time updates for new content)
  NEW_FEED: 'newFeed',
  NEW_FEED_POST: 'newFeedPost',
  NEW_FEED_HASHTAG: 'newFeedHashtag',
  NEW_FEED_REPOST: 'newFeedRepost',

  // ─────────────────────────────────────────────────────────────
  // AI Chat Events (ChatGPT-like conversational AI)
  // ─────────────────────────────────────────────────────────────

  // Conversation List
  AI_CHAT_LIST: 'aiChatList',
  AI_CHAT_LIST_SUCCESS: 'aiChatListSuccess',
  AI_CHAT_LIST_FAILED: 'aiChatListFailed',

  // Create Conversation
  AI_CHAT_CREATE: 'aiChatCreate',
  AI_CHAT_CREATE_SUCCESS: 'aiChatCreateSuccess',
  AI_CHAT_CREATE_FAILED: 'aiChatCreateFailed',

  // Join/Load Conversation
  AI_CHAT_JOIN: 'aiChatJoin',
  AI_CHAT_JOIN_SUCCESS: 'aiChatJoinSuccess',
  AI_CHAT_JOIN_FAILED: 'aiChatJoinFailed',

  // Delete Conversation
  AI_CHAT_DELETE: 'aiChatDelete',
  AI_CHAT_DELETE_SUCCESS: 'aiChatDeleteSuccess',
  AI_CHAT_DELETE_FAILED: 'aiChatDeleteFailed',

  // Archive Conversation
  AI_CHAT_ARCHIVE: 'aiChatArchive',
  AI_CHAT_ARCHIVE_SUCCESS: 'aiChatArchiveSuccess',
  AI_CHAT_ARCHIVE_FAILED: 'aiChatArchiveFailed',

  // Update Title
  AI_CHAT_UPDATE_TITLE: 'aiChatUpdateTitle',
  AI_CHAT_UPDATE_TITLE_SUCCESS: 'aiChatUpdateTitleSuccess',
  AI_CHAT_UPDATE_TITLE_FAILED: 'aiChatUpdateTitleFailed',

  // Clear All Conversations
  AI_CHAT_CLEAR_ALL: 'aiChatClearAll',
  AI_CHAT_CLEAR_ALL_SUCCESS: 'aiChatClearAllSuccess',
  AI_CHAT_CLEAR_ALL_FAILED: 'aiChatClearAllFailed',

  // Send Message (with streaming response)
  AI_SEND_MESSAGE: 'aiSendMessage',
  AI_SEND_MESSAGE_FAILED: 'aiSendMessageFailed',

  // Auto-created conversation (when user sends message without conversationId)
  AI_CHAT_AUTO_CREATED: 'aiChatAutoCreated',

  // Streaming Response Events
  AI_MESSAGE_CHUNK: 'aiMessageChunk',
  AI_MESSAGE_COMPLETE: 'aiMessageComplete',

  // Stop Generation
  AI_STOP_GENERATION: 'aiStopGeneration',
  AI_GENERATION_STOPPED: 'aiGenerationStopped',
  AI_STOP_GENERATION_FAILED: 'aiStopGenerationFailed',

  // Regenerate Response
  AI_REGENERATE: 'aiRegenerate',
  AI_REGENERATE_SUCCESS: 'aiRegenerateSuccess',
  AI_REGENERATE_FAILED: 'aiRegenerateFailed',

  // Typing Indicator
  AI_TYPING: 'aiTyping',

  // ─────────────────────────────────────────────────────────────
  // AI Voice Chat Events (Real-time Voice Conversation)
  // ─────────────────────────────────────────────────────────────

  // Session Management
  VOICE_CHAT_START: 'voiceChatStart',
  VOICE_CHAT_START_FAILED: 'voiceChatStartFailed',
  VOICE_SESSION_READY: 'voiceSessionReady',
  VOICE_SESSION_UPDATE: 'voiceSessionUpdate',
  VOICE_SESSION_STATUS: 'voiceSessionStatus',
  VOICE_CHAT_END: 'voiceChatEnd',
  VOICE_CHAT_ENDED: 'voiceChatEnded',

  // Audio Streaming (Client -> Server -> OpenAI)
  VOICE_AUDIO_APPEND: 'voiceAudioAppend',
  VOICE_AUDIO_COMMIT: 'voiceAudioCommit',
  VOICE_AUDIO_CLEAR: 'voiceAudioClear',
  VOICE_CREATE_RESPONSE: 'voiceCreateResponse',

  // Speech Detection (Server VAD)
  VOICE_SPEECH_STARTED: 'voiceSpeechStarted',
  VOICE_SPEECH_STOPPED: 'voiceSpeechStopped',
  VOICE_INPUT_COMMITTED: 'voiceInputCommitted',
  VOICE_INPUT_CLEARED: 'voiceInputCleared',

  // Conversation Items
  VOICE_ITEM_CREATED: 'voiceItemCreated',
  VOICE_USER_TRANSCRIPT: 'voiceUserTranscript',
  VOICE_TRANSCRIPT_FAILED: 'voiceTranscriptFailed',

  // AI Response Streaming (OpenAI -> Server -> Client)
  VOICE_RESPONSE_STARTED: 'voiceResponseStarted',
  VOICE_OUTPUT_ITEM_ADDED: 'voiceOutputItemAdded',
  VOICE_AUDIO_DELTA: 'voiceAudioDelta',
  VOICE_TRANSCRIPT_DELTA: 'voiceTranscriptDelta',
  VOICE_AUDIO_DONE: 'voiceAudioDone',
  VOICE_TRANSCRIPT_DONE: 'voiceTranscriptDone',
  VOICE_OUTPUT_ITEM_DONE: 'voiceOutputItemDone',
  VOICE_RESPONSE_DONE: 'voiceResponseDone',

  // Interruption & Control
  VOICE_INTERRUPT: 'voiceInterrupt',
  VOICE_INTERRUPTED: 'voiceInterrupted',

  // Hybrid Mode (Text in Voice Session)
  VOICE_SEND_TEXT: 'voiceSendText',

  // Errors
  VOICE_ERROR: 'voiceError',

  // ─────────────────────────────────────────────────────────────
  // Active Users Events (Real-time online user counts)
  // ─────────────────────────────────────────────────────────────

  ACTIVE_USERS: 'activeUsers',
  ACTIVE_USERS_SUCCESS: 'activeUsersSuccess',
  ACTIVE_USERS_FAILED: 'activeUsersFailed',
};
