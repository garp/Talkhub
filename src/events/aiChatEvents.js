const { socketEvents } = require('../../lib/constants/socket');
const aiChatService = require('../services/aiChatService');
const AIConversation = require('../models/aiConversation.model');

/**
 * AI Chat Socket Event Handlers
 *
 * These handlers manage real-time AI chat functionality via Socket.IO,
 * providing ChatGPT-like conversational experience with streaming responses.
 */

// ─────────────────────────────────────────────────────────────
// Conversation Management
// ─────────────────────────────────────────────────────────────

/**
 * Get list of user's AI conversations
 * Event: aiChatList
 * Payload: { page?: number, limit?: number, includeArchived?: boolean }
 */
exports.handleAIChatList = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { page = 1, limit = 20, includeArchived = false } = data || {};

    const result = await aiChatService.getConversations(userId, {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(50, Math.max(1, parseInt(limit, 10) || 20)),
      includeArchived: !!includeArchived,
    });

    socket.emit(socketEvents.AI_CHAT_LIST_SUCCESS, result);
  } catch (error) {
    console.error('handleAIChatList error:', error.message);
    socket.emit(socketEvents.AI_CHAT_LIST_FAILED, {
      message: error.message || 'Failed to get conversation list',
    });
  }
};

/**
 * Create a new AI conversation
 * Event: aiChatCreate
 * Payload: { title?: string, systemPrompt?: string, model?: string }
 */
exports.handleAIChatCreate = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const {
      title, systemPrompt, model, temperature,
    } = data || {};

    const conversation = await aiChatService.createConversation(userId, {
      title,
      systemPrompt,
      model,
      temperature,
    });

    socket.emit(socketEvents.AI_CHAT_CREATE_SUCCESS, { conversation });
  } catch (error) {
    console.error('handleAIChatCreate error:', error.message);
    socket.emit(socketEvents.AI_CHAT_CREATE_FAILED, {
      message: error.message || 'Failed to create conversation',
    });
  }
};

/**
 * Join/load an AI conversation (get full message history)
 * Event: aiChatJoin
 * Payload: { conversationId: string }
 */
exports.handleAIChatJoin = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { conversationId } = data || {};
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const conversation = await aiChatService.getConversation(conversationId, userId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Join a socket room for this conversation (for potential future features)
    socket.join(`ai:${conversationId}`);

    socket.emit(socketEvents.AI_CHAT_JOIN_SUCCESS, {
      conversation: {
        _id: conversation._id,
        title: conversation.title,
        messages: conversation.messages || [],
        systemPrompt: conversation.systemPrompt,
        model: conversation.model,
        temperature: conversation.temperature,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    console.error('handleAIChatJoin error:', error.message);
    socket.emit(socketEvents.AI_CHAT_JOIN_FAILED, {
      message: error.message || 'Failed to join conversation',
    });
  }
};

/**
 * Delete an AI conversation
 * Event: aiChatDelete
 * Payload: { conversationId: string }
 */
exports.handleAIChatDelete = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { conversationId } = data || {};
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const result = await aiChatService.deleteConversation(conversationId, userId);

    if (!result) {
      throw new Error('Conversation not found or already deleted');
    }

    // Leave the socket room
    socket.leave(`ai:${conversationId}`);

    socket.emit(socketEvents.AI_CHAT_DELETE_SUCCESS, { conversationId });
  } catch (error) {
    console.error('handleAIChatDelete error:', error.message);
    socket.emit(socketEvents.AI_CHAT_DELETE_FAILED, {
      message: error.message || 'Failed to delete conversation',
    });
  }
};

/**
 * Archive/unarchive an AI conversation
 * Event: aiChatArchive
 * Payload: { conversationId: string, archive?: boolean }
 */
exports.handleAIChatArchive = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { conversationId, archive = true } = data || {};
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const result = await aiChatService.archiveConversation(conversationId, userId, archive);

    if (!result) {
      throw new Error('Conversation not found');
    }

    socket.emit(socketEvents.AI_CHAT_ARCHIVE_SUCCESS, {
      conversationId,
      isArchived: result.isArchived,
    });
  } catch (error) {
    console.error('handleAIChatArchive error:', error.message);
    socket.emit(socketEvents.AI_CHAT_ARCHIVE_FAILED, {
      message: error.message || 'Failed to archive conversation',
    });
  }
};

/**
 * Update conversation title
 * Event: aiChatUpdateTitle
 * Payload: { conversationId: string, title: string }
 */
exports.handleAIChatUpdateTitle = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { conversationId, title } = data || {};
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Valid title is required');
    }

    const result = await aiChatService.updateTitle(conversationId, userId, title.trim());

    if (!result) {
      throw new Error('Conversation not found');
    }

    socket.emit(socketEvents.AI_CHAT_UPDATE_TITLE_SUCCESS, {
      conversationId,
      title: result.title,
    });
  } catch (error) {
    console.error('handleAIChatUpdateTitle error:', error.message);
    socket.emit(socketEvents.AI_CHAT_UPDATE_TITLE_FAILED, {
      message: error.message || 'Failed to update title',
    });
  }
};

/**
 * Clear all AI conversations for user
 * Event: aiChatClearAll
 * Payload: { confirm: true } (safety check)
 */
exports.handleAIChatClearAll = async (socket, data) => {
  try {
    const { userId } = socket;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const { confirm } = data || {};
    if (confirm !== true) {
      throw new Error('Confirmation required to clear all conversations');
    }

    await aiChatService.clearAllConversations(userId);

    socket.emit(socketEvents.AI_CHAT_CLEAR_ALL_SUCCESS, {
      message: 'All conversations cleared',
    });
  } catch (error) {
    console.error('handleAIChatClearAll error:', error.message);
    socket.emit(socketEvents.AI_CHAT_CLEAR_ALL_FAILED, {
      message: error.message || 'Failed to clear conversations',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// AI Message Handling (Streaming)
// ─────────────────────────────────────────────────────────────

/**
 * Send a message to AI and receive streaming response
 * Event: aiSendMessage
 * Payload: { conversationId?: string, content: string }
 *
 * If conversationId is not provided, a new conversation will be auto-created
 * (ChatGPT-like experience - just start typing!)
 *
 * Response Events:
 *   - aiChatAutoCreated: { conversation } (only if auto-created)
 *   - aiTyping: { isTyping: boolean }
 *   - aiMessageChunk: { conversationId, content } (streamed pieces)
 *   - aiMessageComplete: { conversationId, content, tokens }
 *   - aiSendMessageFailed: { message }
 */
exports.handleAISendMessage = async (socket, data) => {
  const { userId } = socket;
  let { conversationId } = data || {};
  const { content } = data || {};
  let isNewConversation = false;

  // Helper to turn off typing
  const stopTyping = () => {
    socket.emit(socketEvents.AI_TYPING, {
      conversationId,
      isTyping: false,
    });
  };

  try {
    if (!userId) {
      throw new Error('Authentication required');
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('Message content is required');
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 32000) {
      throw new Error('Message too long (max 32000 characters)');
    }

    // Auto-create conversation if not provided (ChatGPT-like experience)
    if (!conversationId) {
      const newConversation = await aiChatService.createConversation(userId, {
        title: trimmedContent.slice(0, 50) + (trimmedContent.length > 50 ? '...' : ''),
      });
      conversationId = newConversation._id.toString();
      isNewConversation = true;

      // Notify client about the new conversation
      socket.emit(socketEvents.AI_CHAT_AUTO_CREATED, {
        conversation: newConversation,
      });

      // Join the socket room for this conversation
      socket.join(`ai:${conversationId}`);
    }

    // Check if already generating
    if (aiChatService.isGenerating(conversationId)) {
      throw new Error('A response is already being generated. Please wait or stop the current generation.');
    }

    // Emit typing indicator
    socket.emit(socketEvents.AI_TYPING, {
      conversationId,
      isTyping: true,
    });

    // Stream the response using callbacks
    await aiChatService.streamResponse(conversationId, userId, trimmedContent, {
      onChunk: (event) => {
        socket.emit(socketEvents.AI_MESSAGE_CHUNK, {
          conversationId: event.conversationId,
          content: event.content,
        });
      },
      onComplete: (event) => {
        socket.emit(socketEvents.AI_MESSAGE_COMPLETE, {
          conversationId: event.conversationId,
          content: event.content,
          tokens: event.tokens,
          isNewConversation,
        });
        stopTyping();
      },
      onStopped: (event) => {
        socket.emit(socketEvents.AI_GENERATION_STOPPED, {
          conversationId: event.conversationId,
          content: event.content,
          reason: 'user_requested',
        });
        stopTyping();
      },
      onError: (error) => {
        console.error('handleAISendMessage stream error:', error.message);
        socket.emit(socketEvents.AI_SEND_MESSAGE_FAILED, {
          conversationId,
          message: error.message || 'Failed to send message',
        });
        stopTyping();
      },
    });
  } catch (error) {
    console.error('handleAISendMessage error:', error.message);
    stopTyping();
    socket.emit(socketEvents.AI_SEND_MESSAGE_FAILED, {
      conversationId,
      message: error.message || 'Failed to send message',
    });
  }
};

/**
 * Stop the current AI generation
 * Event: aiStopGeneration
 * Payload: { conversationId: string }
 */
exports.handleAIStopGeneration = async (socket, data) => {
  try {
    const { conversationId } = data || {};

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const stopped = aiChatService.stopGeneration(conversationId);

    if (stopped) {
      socket.emit(socketEvents.AI_GENERATION_STOPPED, {
        conversationId,
        reason: 'user_requested',
      });
    } else {
      socket.emit(socketEvents.AI_STOP_GENERATION_FAILED, {
        conversationId,
        message: 'No active generation to stop',
      });
    }
  } catch (error) {
    console.error('handleAIStopGeneration error:', error.message);
    socket.emit(socketEvents.AI_STOP_GENERATION_FAILED, {
      conversationId: data?.conversationId,
      message: error.message || 'Failed to stop generation',
    });
  }
};

/**
 * Regenerate the last AI response
 * Event: aiRegenerateResponse
 * Payload: { conversationId: string }
 */
exports.handleAIRegenerateResponse = async (socket, data) => {
  const { userId } = socket;
  const { conversationId } = data || {};

  // Helper to turn off typing
  const stopTyping = () => {
    socket.emit(socketEvents.AI_TYPING, {
      conversationId,
      isTyping: false,
    });
  };

  try {
    if (!userId) {
      throw new Error('Authentication required');
    }

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    // Get conversation
    const conversation = await aiChatService.getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Find the last user message
    const messages = conversation.messages || [];
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) {
      throw new Error('No user message to regenerate response for');
    }

    const lastUserMessage = messages[lastUserMessageIndex].content;

    // Remove messages after (and including) the last user message
    // This will be re-added by streamResponse
    await AIConversation.findByIdAndUpdate(conversationId, {
      $set: {
        messages: messages.slice(0, lastUserMessageIndex),
      },
    });

    // Clear cache
    await aiChatService.clearConversationCache(conversationId);

    // Now regenerate
    socket.emit(socketEvents.AI_TYPING, {
      conversationId,
      isTyping: true,
    });

    // Stream the response using callbacks
    await aiChatService.streamResponse(conversationId, userId, lastUserMessage, {
      onChunk: (event) => {
        socket.emit(socketEvents.AI_MESSAGE_CHUNK, {
          conversationId: event.conversationId,
          content: event.content,
        });
      },
      onComplete: (event) => {
        socket.emit(socketEvents.AI_REGENERATE_SUCCESS, {
          conversationId: event.conversationId,
          content: event.content,
          tokens: event.tokens,
        });
        stopTyping();
      },
      onStopped: (event) => {
        socket.emit(socketEvents.AI_GENERATION_STOPPED, {
          conversationId: event.conversationId,
          content: event.content,
          reason: 'user_requested',
        });
        stopTyping();
      },
      onError: (error) => {
        console.error('handleAIRegenerateResponse stream error:', error.message);
        socket.emit(socketEvents.AI_REGENERATE_FAILED, {
          conversationId,
          message: error.message || 'Failed to regenerate response',
        });
        stopTyping();
      },
    });
  } catch (error) {
    console.error('handleAIRegenerateResponse error:', error.message);
    stopTyping();
    socket.emit(socketEvents.AI_REGENERATE_FAILED, {
      conversationId,
      message: error.message || 'Failed to regenerate response',
    });
  }
};
