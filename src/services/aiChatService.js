const axios = require('axios');
const AIConversation = require('../models/aiConversation.model');
const redisHelper = require('../../lib/helpers/connectRedis');

// Configuration
const MAX_CONTEXT_MESSAGES = 20; // Keep last 20 messages for context
const MAX_CONTEXT_TOKENS = 8000; // Token limit for context window
const CACHE_TTL = 3600; // 1 hour Redis cache TTL
const CACHE_PREFIX = 'ai_conv:';

// Track active streaming generations for cancellation support
const activeGenerations = new Map();

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Estimate tokens for a string (~4 chars per token)
 */
const estimateTokens = (text) => Math.ceil((text || '').length / 4);

/**
 * Get Redis client (lazy connection)
 */
const getRedisClient = async () => {
  try {
    return redisHelper.getClient() || (await redisHelper.connectRedis());
  } catch {
    return null; // Redis unavailable, graceful degradation
  }
};

/**
 * Cache conversation in Redis
 */
const cacheConversation = async (conversationId, conversation) => {
  try {
    const client = await getRedisClient();
    if (!client) return;

    const key = `${CACHE_PREFIX}${conversationId}`;
    await client.set(key, JSON.stringify(conversation), 'EX', CACHE_TTL);
  } catch {
    // Silent fail - cache is optional
  }
};

/**
 * Get cached conversation from Redis
 */
const getCachedConversation = async (conversationId) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;

    const key = `${CACHE_PREFIX}${conversationId}`;
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

/**
 * Clear conversation from cache
 */
const clearConversationCache = async (conversationId) => {
  try {
    const client = await getRedisClient();
    if (!client) return;

    const key = `${CACHE_PREFIX}${conversationId}`;
    await client.del(key);
  } catch {
    // Silent fail
  }
};

/**
 * Build context messages for OpenAI API with smart trimming
 */
const buildContext = (conversation, maxTokens = MAX_CONTEXT_TOKENS) => {
  const messages = [];
  let estimatedTokenCount = 0;

  // Always include system prompt
  const systemContent = conversation.systemPrompt || 'You are a helpful AI assistant.';
  messages.push({
    role: 'system',
    content: systemContent,
  });
  estimatedTokenCount += estimateTokens(systemContent);

  // Get recent messages, prioritizing newer ones
  const recentMessages = (conversation.messages || []).slice(-MAX_CONTEXT_MESSAGES);

  // Add messages from newest to oldest until we hit token limit
  const messagesToAdd = [];
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const msg = recentMessages[i];
    const msgTokens = estimateTokens(msg.content);

    if (estimatedTokenCount + msgTokens > maxTokens) break;

    messagesToAdd.unshift({
      role: msg.role,
      content: msg.content,
    });
    estimatedTokenCount += msgTokens;
  }

  messages.push(...messagesToAdd);

  return { messages, estimatedTokens: estimatedTokenCount };
};

/**
 * Parse SSE stream line
 */
const parseSSELine = (line) => {
  if (line === 'data: [DONE]') return { done: true };
  if (!line.startsWith('data: ')) return null;

  try {
    const json = JSON.parse(line.slice(6));
    const content = json.choices?.[0]?.delta?.content;
    return content ? { content } : null;
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Conversation CRUD Operations
// ─────────────────────────────────────────────────────────────

/**
 * Create a new AI conversation
 */
const createConversation = async (userId, {
  title, systemPrompt, model, temperature,
} = {}) => {
  const conversation = await AIConversation.create({
    userId,
    title: title || 'New Chat',
    systemPrompt: systemPrompt || undefined,
    model: model || undefined,
    temperature: temperature || undefined,
    messages: [],
  });

  return {
    _id: conversation._id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

/**
 * Get paginated list of user's conversations
 */
const getConversations = async (userId, { page = 1, limit = 20, includeArchived = false } = {}) => {
  const skip = (page - 1) * limit;
  const query = { userId };

  if (!includeArchived) {
    query.isArchived = false;
  }

  const [conversations, total] = await Promise.all([
    AIConversation.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('_id title lastMessagePreview lastMessageAt createdAt updatedAt isArchived')
      .lean(),
    AIConversation.countDocuments(query),
  ]);

  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + conversations.length < total,
    },
  };
};

/**
 * Get full conversation with messages
 */
const getConversation = async (conversationId, userId) => {
  // Try cache first
  const cached = await getCachedConversation(conversationId);
  if (cached && cached.userId?.toString() === userId.toString()) {
    return cached;
  }

  const conversation = await AIConversation.findOne({
    _id: conversationId,
    userId,
  }).lean();

  if (conversation) {
    // Cache for future requests
    await cacheConversation(conversationId, conversation);
  }

  return conversation;
};

/**
 * Delete a conversation
 */
const deleteConversation = async (conversationId, userId) => {
  const result = await AIConversation.findOneAndDelete({
    _id: conversationId,
    userId,
  });

  if (result) {
    await clearConversationCache(conversationId);
  }

  return result;
};

/**
 * Archive/unarchive a conversation
 */
const archiveConversation = async (conversationId, userId, archive = true) => {
  const result = await AIConversation.findOneAndUpdate(
    { _id: conversationId, userId },
    { isArchived: archive },
    { new: true },
  );

  if (result) {
    await clearConversationCache(conversationId);
  }

  return result;
};

/**
 * Update conversation title
 */
const updateTitle = async (conversationId, userId, title) => {
  const result = await AIConversation.findOneAndUpdate(
    { _id: conversationId, userId },
    { title: title.slice(0, 200) },
    { new: true },
  );

  if (result) {
    await clearConversationCache(conversationId);
  }

  return result;
};

/**
 * Clear all conversations for a user
 */
const clearAllConversations = async (userId) => {
  const conversations = await AIConversation.find({ userId }).select('_id').lean();

  // Clear cache for each conversation
  await Promise.all(
    conversations.map((c) => clearConversationCache(c._id)),
  );

  return AIConversation.deleteMany({ userId });
};

// ─────────────────────────────────────────────────────────────
// AI Message Handling
// ─────────────────────────────────────────────────────────────

/**
 * Stream AI response using OpenAI API with callbacks
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} userMessage
 * @param {Object} callbacks - { onChunk, onComplete, onStopped, onError }
 */
const streamResponse = async (conversationId, userId, userMessage, callbacks) => {
  const {
    onChunk, onComplete, onStopped, onError,
  } = callbacks;

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (onError) onError(new Error('OpenAI API key not configured'));
    return;
  }

  // Get conversation
  const conversation = await AIConversation.findOne({
    _id: conversationId,
    userId,
  });

  if (!conversation) {
    if (onError) onError(new Error('Conversation not found'));
    return;
  }

  // Add user message
  const userMsgTokens = estimateTokens(userMessage);
  conversation.messages.push({
    role: 'user',
    content: userMessage,
    tokens: userMsgTokens,
  });

  // Auto-generate title from first user message
  if (conversation.messages.filter((m) => m.role === 'user').length === 1) {
    conversation.title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');
  }

  await conversation.save();

  // Build context for API
  const { messages } = buildContext(conversation);

  // Create AbortController for cancellation support
  const controller = new AbortController();
  const convIdStr = conversationId.toString();
  activeGenerations.set(convIdStr, controller);

  let fullResponse = '';

  try {
    const apiURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';

    const response = await axios({
      method: 'post',
      url: apiURL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      data: {
        model: conversation.model || 'gpt-4o',
        messages,
        stream: true,
        temperature: conversation.temperature || 0.7,
      },
      responseType: 'stream',
      signal: controller.signal,
      timeout: 120000, // 2 minute timeout
    });

    // Process streaming response using event handlers
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter((line) => line.trim());

      lines.forEach((line) => {
        const parsed = parseSSELine(line);
        if (parsed && parsed.content) {
          fullResponse += parsed.content;
          if (onChunk) {
            onChunk({
              type: 'chunk',
              content: parsed.content,
              conversationId: convIdStr,
            });
          }
        }
      });
    });

    response.data.on('end', async () => {
      try {
        // Save assistant response
        const responseTokens = estimateTokens(fullResponse);
        conversation.messages.push({
          role: 'assistant',
          content: fullResponse,
          tokens: responseTokens,
        });

        // Update total tokens
        conversation.totalTokens = conversation.messages.reduce(
          (sum, m) => sum + (m.tokens || 0),
          0,
        );

        await conversation.save();
        await clearConversationCache(conversationId);

        if (onComplete) {
          onComplete({
            type: 'complete',
            content: fullResponse,
            conversationId: convIdStr,
            tokens: {
              prompt: userMsgTokens,
              completion: responseTokens,
            },
          });
        }
      } catch (saveError) {
        if (onError) onError(saveError);
      } finally {
        activeGenerations.delete(convIdStr);
      }
    });

    response.data.on('error', async (streamError) => {
      activeGenerations.delete(convIdStr);

      // Handle cancellation gracefully
      if (axios.isCancel(streamError) || streamError.name === 'AbortError') {
        // Save partial response if any
        if (fullResponse) {
          conversation.messages.push({
            role: 'assistant',
            content: `${fullResponse}\n\n[Generation stopped]`,
            tokens: estimateTokens(fullResponse),
          });
          await conversation.save();
        }

        if (onStopped) {
          onStopped({
            type: 'stopped',
            content: fullResponse,
            conversationId: convIdStr,
          });
        }
        return;
      }

      if (onError) onError(streamError);
    });
  } catch (error) {
    activeGenerations.delete(convIdStr);

    // Handle cancellation gracefully
    if (axios.isCancel(error) || error.name === 'AbortError') {
      // Save partial response if any
      if (fullResponse) {
        conversation.messages.push({
          role: 'assistant',
          content: `${fullResponse}\n\n[Generation stopped]`,
          tokens: estimateTokens(fullResponse),
        });
        await conversation.save();
      }

      if (onStopped) {
        onStopped({
          type: 'stopped',
          content: fullResponse,
          conversationId: convIdStr,
        });
      }
      return;
    }

    if (onError) onError(error);
  }
};

/**
 * Stop an active generation
 */
const stopGeneration = (conversationId) => {
  const convIdStr = conversationId.toString();
  const controller = activeGenerations.get(convIdStr);

  if (controller) {
    controller.abort();
    activeGenerations.delete(convIdStr);
    return true;
  }

  return false;
};

/**
 * Check if a generation is active
 */
const isGenerating = (conversationId) => activeGenerations.has(conversationId.toString());

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  archiveConversation,
  updateTitle,
  clearAllConversations,
  clearConversationCache,
  streamResponse,
  stopGeneration,
  isGenerating,
};
