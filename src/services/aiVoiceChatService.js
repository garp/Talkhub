const WebSocket = require('ws');

// ─────────────────────────────────────────────────────────────
// Logging Helpers
// ─────────────────────────────────────────────────────────────

const LOG_PREFIX = '[VoiceChat]';
const LOG_OPENAI_PREFIX = '[VoiceChat:OpenAI]';

const log = {
  info: (userId, message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`${timestamp} ${LOG_PREFIX} [User:${userId}] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${timestamp} ${LOG_PREFIX} [User:${userId}] ${message}`);
    }
  },
  openai: (userId, eventType, data = null) => {
    const timestamp = new Date().toISOString();
    // Don't log full audio delta data (too large)
    if (eventType === 'response.audio.delta' && data) {
      console.log(`${timestamp} ${LOG_OPENAI_PREFIX} [User:${userId}] ← ${eventType} (audio chunk: ${data.length || 'N/A'} chars)`);
    } else if (data) {
      console.log(`${timestamp} ${LOG_OPENAI_PREFIX} [User:${userId}] ← ${eventType}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${timestamp} ${LOG_OPENAI_PREFIX} [User:${userId}] ← ${eventType}`);
    }
  },
  send: (userId, eventType, dataSize = null) => {
    const timestamp = new Date().toISOString();
    if (dataSize) {
      console.log(`${timestamp} ${LOG_OPENAI_PREFIX} [User:${userId}] → ${eventType} (${dataSize} bytes)`);
    } else {
      console.log(`${timestamp} ${LOG_OPENAI_PREFIX} [User:${userId}] → ${eventType}`);
    }
  },
  error: (userId, message, error = null) => {
    const timestamp = new Date().toISOString();
    if (error) {
      console.error(`${timestamp} ${LOG_PREFIX} [User:${userId}] ERROR: ${message}`, error);
    } else {
      console.error(`${timestamp} ${LOG_PREFIX} [User:${userId}] ERROR: ${message}`);
    }
  },
};

/**
 * AI Voice Chat Service
 *
 * This service provides real-time voice conversation functionality using OpenAI's Realtime API.
 * It acts as a secure proxy between the client and OpenAI, keeping the API key server-side.
 *
 * Architecture:
 *   Client (Socket.IO) <---> This Server (Proxy) <---> OpenAI Realtime API (WebSocket)
 *
 * Features:
 *   - Real-time bidirectional audio streaming
 *   - Server-side Voice Activity Detection (VAD)
 *   - Speech-to-text transcription (Whisper)
 *   - Text-to-speech synthesis
 *   - Interruption support
 *   - Multiple voice options
 */

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

// Store active voice sessions (userId -> VoiceChatSession)
const activeSessions = new Map();

/**
 * Available voices for TTS
 */
const AVAILABLE_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

/**
 * Default system prompt for voice conversations
 */
const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly AI voice assistant. 
Keep your responses concise and conversational since this is a voice conversation.
Avoid using markdown, code blocks, or formatting that doesn't translate well to speech.
Be natural, warm, and engaging in your tone.`;

/**
 * VoiceChatSession Class
 *
 * Manages a single voice chat session between a user and OpenAI's Realtime API.
 * Handles WebSocket connection, event routing, and session lifecycle.
 */
class VoiceChatSession {
  constructor(userId, clientSocket, options = {}) {
    this.userId = userId;
    this.clientSocket = clientSocket;
    this.openaiWs = null;
    this.isConnected = false;
    this.sessionId = null;
    this.conversationId = options.conversationId || null;

    // Platform info (set when first audio chunk is received)
    this.platform = options.platform || null;

    // Session configuration
    this.config = {
      voice: AVAILABLE_VOICES.includes(options.voice) ? options.voice : 'alloy',
      systemPrompt: options.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      turnDetection: options.turnDetection !== false, // Default: true (server VAD)
      temperature: options.temperature || 0.8,
      maxResponseTokens: options.maxResponseTokens || 4096,
    };

    // Metrics
    this.metrics = {
      startTime: null,
      audioChunksSent: 0,
      audioChunksReceived: 0,
      transcriptsReceived: 0,
      // Transcoding metrics (for Android AAC -> PCM16)
      transcodeCount: 0,
      totalTranscodeTimeMs: 0,
      transcodeErrors: 0,
    };
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.OPENAI_API_KEY;

      log.info(this.userId, '🔌 Connecting to OpenAI Realtime API...', {
        url: OPENAI_REALTIME_URL,
        voice: this.config.voice,
        turnDetection: this.config.turnDetection,
      });

      if (!apiKey) {
        log.error(this.userId, 'OpenAI API key not configured');
        reject(new Error('OpenAI API key not configured'));
        return;
      }

      try {
        this.openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'OpenAI-Beta': 'realtime=v1',
          },
        });

        // Connection timeout
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            log.error(this.userId, 'Connection timeout - OpenAI did not respond in 15s');
            this.openaiWs.close();
            reject(new Error('Connection timeout - OpenAI Realtime API did not respond'));
          }
        }, 15000);

        this.openaiWs.on('open', () => {
          log.info(this.userId, '✅ OpenAI WebSocket CONNECTED');
          clearTimeout(timeout);
          this.isConnected = true;
          this.metrics.startTime = Date.now();
          this.configureSession();
          resolve();
        });

        this.openaiWs.on('message', (data) => {
          this.handleOpenAIMessage(data);
        });

        this.openaiWs.on('error', (error) => {
          log.error(this.userId, 'OpenAI WebSocket ERROR', error.message);
          clearTimeout(timeout);
          this.clientSocket.emit('voiceError', {
            message: 'Voice connection error',
            code: 'OPENAI_WS_ERROR',
          });
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.openaiWs.on('close', (code, reason) => {
          log.info(this.userId, '🔴 OpenAI WebSocket CLOSED', { code, reason: reason?.toString() });
          clearTimeout(timeout);
          this.isConnected = false;
          this.clientSocket.emit('voiceSessionEnded', {
            code,
            reason: reason?.toString() || 'Connection closed',
            metrics: this.getMetrics(),
          });
        });
      } catch (error) {
        log.error(this.userId, 'Failed to create WebSocket', error);
        reject(error);
      }
    });
  }

  /**
   * Configure the OpenAI session with our preferences
   */
  configureSession() {
    log.info(this.userId, '⚙️ Configuring OpenAI session...', {
      voice: this.config.voice,
      turnDetection: this.config.turnDetection,
      temperature: this.config.temperature,
    });

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.systemPrompt,
        voice: this.config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: this.config.turnDetection ? {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        } : null,
        temperature: this.config.temperature,
        max_response_output_tokens: this.config.maxResponseTokens,
      },
    };

    this.sendToOpenAI(sessionConfig);
  }

  /**
   * Handle incoming messages from OpenAI Realtime API
   */
  handleOpenAIMessage(data) {
    try {
      const event = JSON.parse(data.toString());

      // Log all events (audio.delta is summarized to avoid log spam)
      if (event.type === 'response.audio.delta') {
        log.openai(this.userId, event.type, event.delta?.length);
      } else {
        log.openai(this.userId, event.type, this.extractEventSummary(event));
      }

      switch (event.type) {
        // ─────────────────────────────────────────────────────────────
        // Session Events
        // ─────────────────────────────────────────────────────────────
        case 'session.created':
          this.sessionId = event.session?.id;
          log.info(this.userId, '📋 Session created', { sessionId: this.sessionId });
          break;

        case 'session.updated':
          log.info(this.userId, '✅ Session configured and ready!', {
            sessionId: event.session?.id,
            voice: this.config.voice,
          });
          this.clientSocket.emit('voiceSessionReady', {
            sessionId: event.session?.id,
            voice: this.config.voice,
            turnDetection: this.config.turnDetection,
          });
          break;

        // ─────────────────────────────────────────────────────────────
        // Input Audio Buffer Events
        // ─────────────────────────────────────────────────────────────
        case 'input_audio_buffer.speech_started':
          log.info(this.userId, '🎤 User started speaking', { audioStartMs: event.audio_start_ms });
          this.clientSocket.emit('voiceSpeechStarted', {
            audioStartMs: event.audio_start_ms,
          });
          break;

        case 'input_audio_buffer.speech_stopped':
          log.info(this.userId, '🎤 User stopped speaking', { audioEndMs: event.audio_end_ms });
          this.clientSocket.emit('voiceSpeechStopped', {
            audioEndMs: event.audio_end_ms,
          });
          break;

        case 'input_audio_buffer.committed':
          log.info(this.userId, '📥 Audio buffer committed', { itemId: event.item_id });
          this.clientSocket.emit('voiceInputCommitted', {
            itemId: event.item_id,
          });
          break;

        case 'input_audio_buffer.cleared':
          log.info(this.userId, '🗑️ Audio buffer cleared');
          this.clientSocket.emit('voiceInputCleared');
          break;

        // ─────────────────────────────────────────────────────────────
        // Conversation Item Events
        // ─────────────────────────────────────────────────────────────
        case 'conversation.item.created':
          log.info(this.userId, '📝 Conversation item created', {
            itemId: event.item?.id,
            type: event.item?.type,
            role: event.item?.role,
          });
          this.clientSocket.emit('voiceItemCreated', {
            itemId: event.item?.id,
            type: event.item?.type,
            role: event.item?.role,
          });
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.metrics.transcriptsReceived += 1;
          log.info(this.userId, '📝 User speech transcribed', { transcript: event.transcript });
          this.clientSocket.emit('voiceUserTranscript', {
            text: event.transcript,
            itemId: event.item_id,
          });
          break;

        case 'conversation.item.input_audio_transcription.failed':
          log.error(this.userId, 'Transcription failed', event.error);
          this.clientSocket.emit('voiceTranscriptFailed', {
            itemId: event.item_id,
            error: event.error?.message || 'Transcription failed',
          });
          break;

        // ─────────────────────────────────────────────────────────────
        // Response Events
        // ─────────────────────────────────────────────────────────────
        case 'response.created':
          log.info(this.userId, '🤖 AI response STARTED', { responseId: event.response?.id });
          this.clientSocket.emit('voiceResponseStarted', {
            responseId: event.response?.id,
          });
          break;

        case 'response.output_item.added':
          log.info(this.userId, '🤖 AI output item added', {
            responseId: event.response_id,
            itemId: event.item?.id,
            type: event.item?.type,
          });
          this.clientSocket.emit('voiceOutputItemAdded', {
            responseId: event.response_id,
            itemId: event.item?.id,
            type: event.item?.type,
          });
          break;

        case 'response.audio.delta':
          this.metrics.audioChunksReceived += 1;
          // Don't log each audio chunk - too noisy
          this.clientSocket.emit('voiceAudioDelta', {
            audio: event.delta, // base64 encoded PCM16
            responseId: event.response_id,
            itemId: event.item_id,
          });
          break;

        case 'response.audio_transcript.delta':
          // Log AI transcript as it streams
          log.info(this.userId, `🗣️ AI speaking: "${event.delta}"`);
          this.clientSocket.emit('voiceTranscriptDelta', {
            text: event.delta,
            responseId: event.response_id,
            itemId: event.item_id,
          });
          break;

        case 'response.audio.done':
          log.info(this.userId, '🔊 AI audio stream complete', {
            totalChunks: this.metrics.audioChunksReceived,
          });
          this.clientSocket.emit('voiceAudioDone', {
            responseId: event.response_id,
            itemId: event.item_id,
          });
          break;

        case 'response.audio_transcript.done':
          log.info(this.userId, '📝 AI full transcript', { transcript: event.transcript });
          this.clientSocket.emit('voiceTranscriptDone', {
            text: event.transcript,
            responseId: event.response_id,
            itemId: event.item_id,
          });
          break;

        case 'response.output_item.done':
          this.clientSocket.emit('voiceOutputItemDone', {
            responseId: event.response_id,
            itemId: event.item?.id,
          });
          break;

        case 'response.done':
          log.info(this.userId, '✅ AI response COMPLETE', {
            responseId: event.response?.id,
            status: event.response?.status,
            usage: event.response?.usage,
          });
          this.clientSocket.emit('voiceResponseDone', {
            responseId: event.response?.id,
            status: event.response?.status,
            usage: event.response?.usage,
          });
          break;

        // ─────────────────────────────────────────────────────────────
        // Error Events
        // ─────────────────────────────────────────────────────────────
        case 'error':
          log.error(this.userId, '❌ OpenAI ERROR', event.error);
          this.clientSocket.emit('voiceError', {
            message: event.error?.message || 'Unknown error',
            code: event.error?.code,
            type: event.error?.type,
          });
          break;

        // ─────────────────────────────────────────────────────────────
        // Rate Limit Events
        // ─────────────────────────────────────────────────────────────
        case 'rate_limits.updated':
          log.info(this.userId, '⚠️ Rate limits updated', event.rate_limits);
          break;

        default:
          log.info(this.userId, `❓ Unhandled event: ${event.type}`);
      }
    } catch (error) {
      log.error(this.userId, 'Error parsing OpenAI message', error);
    }
  }

  /**
   * Extract summary info from event for logging (avoiding huge payloads)
   */
  // eslint-disable-next-line class-methods-use-this
  extractEventSummary(event) {
    const summary = { type: event.type };

    if (event.session?.id) summary.sessionId = event.session.id;
    if (event.response?.id) summary.responseId = event.response.id;
    if (event.item?.id) summary.itemId = event.item.id;
    if (event.item?.role) summary.role = event.item.role;
    if (event.transcript) summary.transcript = event.transcript.substring(0, 100);
    if (event.delta && typeof event.delta === 'string') {
      summary.deltaLength = event.delta.length;
    }
    if (event.error) summary.error = event.error;

    return summary;
  }

  /**
   * Send data to OpenAI Realtime API
   */
  sendToOpenAI(data) {
    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(data);
      // Log the event type being sent (not audio data)
      if (data.type !== 'input_audio_buffer.append') {
        log.send(this.userId, data.type);
      }
      this.openaiWs.send(payload);
      return true;
    }
    log.error(this.userId, `Cannot send to OpenAI - WebSocket not open (state: ${this.openaiWs?.readyState})`);
    return false;
  }

  /**
   * Append audio chunk from client to OpenAI
   * @param {string} audioBase64 - Base64 encoded PCM16 audio
   */
  appendAudio(audioBase64) {
    this.metrics.audioChunksSent += 1;

    // Log every 10th chunk to avoid spam
    if (this.metrics.audioChunksSent % 10 === 1) {
      log.info(this.userId, `🎙️ Sending audio chunk #${this.metrics.audioChunksSent} (${audioBase64.length} chars)`);
    }

    return this.sendToOpenAI({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  /**
   * Commit the audio buffer (for manual VAD mode)
   * This signals that the user has finished speaking
   */
  commitAudio() {
    return this.sendToOpenAI({
      type: 'input_audio_buffer.commit',
    });
  }

  /**
   * Clear the audio buffer
   */
  clearAudio() {
    return this.sendToOpenAI({
      type: 'input_audio_buffer.clear',
    });
  }

  /**
   * Cancel the current response (interrupt the AI)
   */
  cancelResponse() {
    return this.sendToOpenAI({
      type: 'response.cancel',
    });
  }

  /**
   * Manually trigger a response (for manual VAD mode)
   */
  createResponse() {
    return this.sendToOpenAI({
      type: 'response.create',
    });
  }

  /**
   * Send a text message instead of audio (hybrid mode)
   * @param {string} text - Text message to send
   */
  sendTextMessage(text) {
    // Create conversation item with text
    this.sendToOpenAI({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text,
        }],
      },
    });

    // Trigger response generation
    return this.sendToOpenAI({
      type: 'response.create',
    });
  }

  /**
   * Update session configuration
   * @param {Object} updates - Configuration updates
   */
  updateSession(updates) {
    const allowedUpdates = {};

    if (updates.voice && AVAILABLE_VOICES.includes(updates.voice)) {
      allowedUpdates.voice = updates.voice;
      this.config.voice = updates.voice;
    }

    if (updates.systemPrompt) {
      allowedUpdates.instructions = updates.systemPrompt;
      this.config.systemPrompt = updates.systemPrompt;
    }

    if (typeof updates.turnDetection === 'boolean') {
      allowedUpdates.turn_detection = updates.turnDetection ? {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
      } : null;
      this.config.turnDetection = updates.turnDetection;
    }

    if (Object.keys(allowedUpdates).length > 0) {
      return this.sendToOpenAI({
        type: 'session.update',
        session: allowedUpdates,
      });
    }

    return false;
  }

  /**
   * Get session metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      durationMs: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      isConnected: this.isConnected,
      platform: this.platform,
      avgTranscodeTimeMs: this.metrics.transcodeCount > 0
        ? Math.round(this.metrics.totalTranscodeTimeMs / this.metrics.transcodeCount)
        : 0,
    };
  }

  /**
   * Disconnect from OpenAI and cleanup
   */
  disconnect() {
    if (this.openaiWs) {
      try {
        this.openaiWs.close();
      } catch (error) {
        console.error(`[VoiceChat] Error closing WebSocket for user ${this.userId}:`, error);
      }
      this.openaiWs = null;
    }
    this.isConnected = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Module Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  VoiceChatSession,
  activeSessions,
  AVAILABLE_VOICES,
  DEFAULT_SYSTEM_PROMPT,
};
