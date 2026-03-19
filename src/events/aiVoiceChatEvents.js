const { socketEvents } = require('../../lib/constants/socket');
const { VoiceChatSession, activeSessions, AVAILABLE_VOICES } = require('../services/aiVoiceChatService');
const { transcodeAacToPcm16, shouldTranscode } = require('../../lib/helpers/audioTranscoder');

// ─────────────────────────────────────────────────────────────
// Logging Helper
// ─────────────────────────────────────────────────────────────
const logEvent = (userId, event, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`${timestamp} [VoiceChat:Frontend] [User:${userId}] ← ${event}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${timestamp} [VoiceChat:Frontend] [User:${userId}] ← ${event}`);
  }
};

/**
 * AI Voice Chat Socket Event Handlers
 *
 * These handlers manage real-time voice conversation functionality via Socket.IO,
 * acting as a secure proxy between clients and OpenAI's Realtime API.
 *
 * Flow:
 *   1. Client emits voiceChatStart to initiate a session
 *   2. Server creates WebSocket connection to OpenAI
 *   3. Client streams audio via voiceAudioAppend
 *   4. Server relays audio to OpenAI
 *   5. OpenAI processes and streams back audio/transcripts
 *   6. Server relays responses to client
 */

// ─────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────

/**
 * Start a new voice chat session
 * Event: voiceChatStart
 * Payload: {
 *   voice?: string,           // Voice to use (alloy, echo, fable, onyx, nova, shimmer)
 *   systemPrompt?: string,    // Custom AI personality/instructions
 *   turnDetection?: boolean,  // Enable server-side VAD (default: true)
 *   conversationId?: string   // Optional: link to text conversation
 * }
 */
exports.handleVoiceChatStart = async (socket, data) => {
  try {
    const { userId } = socket;

    logEvent(userId || 'unknown', 'voiceChatStart', {
      voice: data?.voice,
      turnDetection: data?.turnDetection,
      hasSystemPrompt: !!data?.systemPrompt,
    });

    if (!userId) {
      throw new Error('Authentication required');
    }

    // Validate voice if provided
    if (data?.voice && !AVAILABLE_VOICES.includes(data.voice)) {
      throw new Error(`Invalid voice. Available voices: ${AVAILABLE_VOICES.join(', ')}`);
    }

    // Cleanup any existing session for this user
    const existingSession = activeSessions.get(userId.toString());
    if (existingSession) {
      logEvent(userId, 'Cleaning up existing session');
      existingSession.disconnect();
      activeSessions.delete(userId.toString());
    }

    // Create new session
    const session = new VoiceChatSession(userId, socket, {
      voice: data?.voice,
      systemPrompt: data?.systemPrompt,
      turnDetection: data?.turnDetection,
      conversationId: data?.conversationId,
      temperature: data?.temperature,
      maxResponseTokens: data?.maxResponseTokens,
    });

    // Connect to OpenAI
    await session.connect();

    // Store session
    activeSessions.set(userId.toString(), session);

    logEvent(userId, '✅ Session started successfully', { voice: session.config.voice });
  } catch (error) {
    const userId = socket?.userId || 'unknown';
    logEvent(userId, '❌ Start FAILED', { error: error.message });
    socket.emit(socketEvents.VOICE_CHAT_START_FAILED, {
      message: error.message || 'Failed to start voice chat',
    });
  }
};

/**
 * End the current voice chat session
 * Event: voiceChatEnd
 */
exports.handleVoiceChatEnd = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    const metrics = session.getMetrics();
    session.disconnect();
    activeSessions.delete(userId.toString());
    console.log(`[VoiceChat] Session ended for user: ${userId}`, metrics);

    socket.emit(socketEvents.VOICE_CHAT_ENDED, {
      metrics,
    });
  } else {
    socket.emit(socketEvents.VOICE_CHAT_ENDED, {
      message: 'No active session',
    });
  }
};

/**
 * Update session configuration mid-conversation
 * Event: voiceSessionUpdate
 * Payload: {
 *   voice?: string,
 *   systemPrompt?: string,
 *   turnDetection?: boolean
 * }
 */
exports.handleVoiceSessionUpdate = (socket, data) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (!session) {
    socket.emit(socketEvents.VOICE_ERROR, {
      message: 'No active voice session',
      code: 'NO_SESSION',
    });
    return;
  }

  if (data?.voice && !AVAILABLE_VOICES.includes(data.voice)) {
    socket.emit(socketEvents.VOICE_ERROR, {
      message: `Invalid voice. Available voices: ${AVAILABLE_VOICES.join(', ')}`,
      code: 'INVALID_VOICE',
    });
    return;
  }

  const updated = session.updateSession(data);
  if (updated) {
    console.log(`[VoiceChat] Session updated for user: ${userId}`);
  }
};

// ─────────────────────────────────────────────────────────────
// Audio Streaming
// ─────────────────────────────────────────────────────────────

/**
 * Receive audio chunk from client and relay to OpenAI
 * Event: voiceAudioAppend
 * Payload: {
 *   audio: string,           // Base64 encoded audio data
 *   format?: string,         // 'pcm16' (iOS) or 'aac' (Android)
 *   sampleRate?: number,     // 24000 (expected)
 *   channels?: number,       // 1 (mono)
 *   platform?: string,       // 'ios', 'android', or 'web'
 *   needsTranscode?: boolean // true for Android AAC, false for iOS PCM16
 * }
 */
exports.handleVoiceAudioAppend = async (socket, data) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (!session) {
    // Silently ignore if no session (avoid spamming errors during streaming)
    return;
  }

  if (!data?.audio) {
    logEvent(userId, '⚠️ voiceAudioAppend received with NO AUDIO DATA');
    return;
  }

  const {
    audio,
    format,
    platform,
    needsTranscode,
  } = data;

  // Log first audio chunk with metadata
  if (session.metrics.audioChunksSent === 0) {
    logEvent(userId, '🎙️ First audio chunk received', {
      format: format || 'not specified',
      platform: platform || 'not specified',
      needsTranscode,
      audioLength: audio.length,
    });
  }

  // Track platform in session if provided
  if (platform && !session.platform) {
    session.platform = platform;
    logEvent(userId, `📱 Platform detected: ${platform}`);
  }

  let processedAudio = audio;

  // Check if transcoding is needed (Android sends AAC, OpenAI requires PCM16)
  const needsTranscoding = shouldTranscode({ format, platform, needsTranscode });

  if (needsTranscoding) {
    try {
      logEvent(userId, `🔄 Transcoding ${format || 'AAC'} → PCM16...`);
      const startTime = Date.now();

      processedAudio = await transcodeAacToPcm16(audio);

      const transcodeDuration = Date.now() - startTime;
      logEvent(userId, `✅ Transcoding complete (${transcodeDuration}ms)`, {
        inputLength: audio.length,
        outputLength: processedAudio.length,
      });

      // Track transcoding metrics
      if (!session.metrics.transcodeCount) {
        session.metrics.transcodeCount = 0;
        session.metrics.totalTranscodeTimeMs = 0;
      }
      session.metrics.transcodeCount += 1;
      session.metrics.totalTranscodeTimeMs += transcodeDuration;
    } catch (error) {
      logEvent(userId, '❌ Transcoding FAILED', { error: error.message });

      socket.emit(socketEvents.VOICE_ERROR, {
        message: 'Audio transcoding failed',
        code: 'TRANSCODE_ERROR',
        details: error.message,
      });

      // Increment transcode error count
      if (!session.metrics.transcodeErrors) {
        session.metrics.transcodeErrors = 0;
      }
      session.metrics.transcodeErrors += 1;

      return;
    }
  }

  session.appendAudio(processedAudio);
};

/**
 * Commit the audio buffer (signals end of speech in manual VAD mode)
 * Event: voiceAudioCommit
 */
exports.handleVoiceAudioCommit = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    session.commitAudio();
  }
};

/**
 * Clear the audio buffer
 * Event: voiceAudioClear
 */
exports.handleVoiceAudioClear = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    session.clearAudio();
  }
};

/**
 * Manually trigger a response (for manual VAD mode)
 * Event: voiceCreateResponse
 */
exports.handleVoiceCreateResponse = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    session.createResponse();
  }
};

// ─────────────────────────────────────────────────────────────
// Interruption & Control
// ─────────────────────────────────────────────────────────────

/**
 * Interrupt/cancel the current AI response
 * Event: voiceInterrupt
 */
exports.handleVoiceInterrupt = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    session.cancelResponse();
    socket.emit(socketEvents.VOICE_INTERRUPTED);
    console.log(`[VoiceChat] Response interrupted for user: ${userId}`);
  }
};

// ─────────────────────────────────────────────────────────────
// Hybrid Mode (Text + Voice)
// ─────────────────────────────────────────────────────────────

/**
 * Send a text message during voice session (hybrid mode)
 * The AI will respond with audio
 * Event: voiceSendText
 * Payload: {
 *   text: string  // Text message to send
 * }
 */
exports.handleVoiceSendText = (socket, data) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (!session) {
    socket.emit(socketEvents.VOICE_ERROR, {
      message: 'No active voice session',
      code: 'NO_SESSION',
    });
    return;
  }

  if (!data?.text || typeof data.text !== 'string' || !data.text.trim()) {
    socket.emit(socketEvents.VOICE_ERROR, {
      message: 'Text message is required',
      code: 'INVALID_TEXT',
    });
    return;
  }

  session.sendTextMessage(data.text.trim());
  console.log(`[VoiceChat] Text message sent for user: ${userId}`);
};

// ─────────────────────────────────────────────────────────────
// Connection Lifecycle
// ─────────────────────────────────────────────────────────────

/**
 * Handle socket disconnect - cleanup session
 * This should be called from the main disconnect handler
 */
exports.handleDisconnect = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    console.log(`[VoiceChat] Cleaning up session on disconnect for user: ${userId}`);
    session.disconnect();
    activeSessions.delete(userId.toString());
  }
};

/**
 * Get session status
 * Event: voiceSessionStatus
 */
exports.handleVoiceSessionStatus = (socket) => {
  const { userId } = socket;
  const session = activeSessions.get(userId?.toString());

  if (session) {
    socket.emit(socketEvents.VOICE_SESSION_STATUS, {
      active: true,
      voice: session.config.voice,
      turnDetection: session.config.turnDetection,
      metrics: session.getMetrics(),
    });
  } else {
    socket.emit(socketEvents.VOICE_SESSION_STATUS, {
      active: false,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Utility Exports
// ─────────────────────────────────────────────────────────────

/**
 * Get count of active voice sessions (for monitoring)
 */
exports.getActiveSessionCount = () => activeSessions.size;

/**
 * Get all active sessions (for admin/monitoring)
 */
exports.getActiveSessions = () => {
  const sessions = [];
  activeSessions.forEach((session, odlUserId) => {
    sessions.push({
      odlUserId,
      voice: session.config.voice,
      isConnected: session.isConnected,
      metrics: session.getMetrics(),
    });
  });
  return sessions;
};
