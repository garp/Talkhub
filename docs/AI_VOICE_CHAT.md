# AI Voice Chat - Frontend Integration Guide

This document provides comprehensive documentation for integrating real-time AI voice conversation functionality into your frontend application (React Native, Flutter, Web).

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Audio Format Specifications](#audio-format-specifications)
4. [Android Audio Transcoding](#android-audio-transcoding)
5. [Socket Events Reference](#socket-events-reference)
6. [Integration Guide](#integration-guide)
7. [React Native Implementation](#react-native-implementation)
8. [Flutter Implementation](#flutter-implementation)
9. [Web Implementation](#web-implementation)
10. [Voice Options](#voice-options)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The AI Voice Chat feature provides **Gemini Live / ChatGPT Voice-like** real-time voice conversation experience. Key features include:

- **Real-time bidirectional audio streaming** - Talk naturally, get instant audio responses
- **Server-side Voice Activity Detection (VAD)** - Automatic speech detection
- **Speech-to-text transcription** - See what you and AI said
- **Multiple voice options** - 8 different AI voice personalities
- **Interruption support** - Cut off AI mid-sentence
- **Hybrid mode** - Send text during voice session
- **Low latency** - ~300-500ms response time

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR MOBILE APP / WEB                            │
│                                                                         │
│  1. User speaks    ┌─────────────┐    2. App captures audio             │
│     into mic  ────►│ Microphone  │────► as PCM16 chunks                 │
│                    └─────────────┘      (24kHz, mono, 16-bit)           │
│                                                                         │
│                    ┌─────────────┐                                      │
│  5. User hears ◄───│   Speaker   │◄──── 4. App plays audio              │
│     AI response    └─────────────┘      from chunks                     │
│                                                                         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Socket.IO (voiceAudioAppend / voiceAudioDelta)
                             │
┌────────────────────────────┴────────────────────────────────────────────┐
│                         CHIT-CHAT SERVER                                 │
│                                                                         │
│  Receives audio ──► Relays to OpenAI ──► Receives AI audio ──► Relays  │
│  from client        (acts as proxy)      from OpenAI          to client │
│                                                                         │
│  ✓ Keeps API key secure                                                 │
│  ✓ Handles authentication                                               │
│  ✓ Manages session lifecycle                                            │
│                                                                         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ WebSocket
                             │
┌────────────────────────────┴────────────────────────────────────────────┐
│                    OPENAI REALTIME API                                   │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Whisper   │───►│   GPT-4o    │───►│    TTS      │                 │
│  │    (STT)    │    │  (Process)  │    │  (Speak)    │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                                                                         │
│  Transcribes ──────► Generates ────────► Synthesizes                    │
│  user speech         response            AI voice                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Data Flow

| Step | Direction | Data | Format |
|------|-----------|------|--------|
| 1 | User → App | Voice | Microphone capture |
| 2 | App → Server | Audio | Base64 PCM16 via `voiceAudioAppend` |
| 3 | Server → OpenAI | Audio | Base64 PCM16 via WebSocket |
| 4 | OpenAI → Server | Audio + Transcript | Base64 PCM16 + Text |
| 5 | Server → App | Audio + Transcript | Base64 PCM16 via `voiceAudioDelta` |
| 6 | App → User | Voice | Speaker playback |

### Key Points

1. **All STT/TTS happens on OpenAI's servers** - Your app just streams raw audio
2. **Server acts as a secure proxy** - API key never exposed to client
3. **PCM16 format** - Raw audio, no compression needed
4. **Base64 encoding** - For safe transmission over WebSocket/Socket.IO

---

## Audio Format Specifications

### Input Audio (User → AI)

| Property | Value |
|----------|-------|
| Format | PCM16 (Linear PCM) |
| Sample Rate | 24,000 Hz (24kHz) |
| Channels | 1 (Mono) |
| Bit Depth | 16-bit |
| Byte Order | Little-endian |
| Encoding | Base64 string |

### Output Audio (AI → User)

| Property | Value |
|----------|-------|
| Format | PCM16 (Linear PCM) |
| Sample Rate | 24,000 Hz (24kHz) |
| Channels | 1 (Mono) |
| Bit Depth | 16-bit |
| Byte Order | Little-endian |
| Encoding | Base64 string |

### Chunk Size Recommendations

| Platform | Recommended Chunk Duration | Bytes per Chunk |
|----------|---------------------------|-----------------|
| React Native | 100ms | 4,800 bytes |
| Flutter | 100ms | 4,800 bytes |
| Web | 50-100ms | 2,400-4,800 bytes |

---

## Android Audio Transcoding

### The Problem

OpenAI's Realtime API requires audio in **PCM16 format** (raw 16-bit linear PCM). However, different mobile platforms record audio differently:

| Platform | Native Recording Format | Needs Transcoding |
|----------|------------------------|-------------------|
| **iOS** | Linear PCM (LPCM) | ❌ No |
| **Android** | AAC (M4A container) | ✅ Yes |
| **Web** | WebM/Opus | ✅ Yes |

### Solution

The server automatically transcodes AAC audio to PCM16 using FFmpeg when needed. This is transparent to the client.

### How It Works

1. **Client sends metadata** with audio chunks indicating format and platform
2. **Server checks** if transcoding is needed
3. **If Android/AAC**: Server transcodes to PCM16 using FFmpeg (~50-200ms latency)
4. **If iOS/PCM16**: Audio is passed directly to OpenAI (no latency added)

### Updated voiceAudioAppend Payload

When sending audio, include metadata to enable server-side transcoding:

```javascript
// iOS - No transcoding needed
socket.emit('voiceAudioAppend', {
  audio: base64PcmAudio,
  format: 'pcm16',
  sampleRate: 24000,
  channels: 1,
  platform: 'ios',
  needsTranscode: false,
});

// Android - Server will transcode AAC to PCM16
socket.emit('voiceAudioAppend', {
  audio: base64AacAudio,
  format: 'aac',
  sampleRate: 24000,
  channels: 1,
  platform: 'android',
  needsTranscode: true,
});
```

### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | string | ✅ | Base64 encoded audio data |
| `format` | string | ⚡ | Audio format: 'pcm16', 'aac', 'mp3', etc. |
| `sampleRate` | number | ⚡ | Sample rate (expected: 24000) |
| `channels` | number | ⚡ | Channel count (expected: 1) |
| `platform` | string | ⚡ | Client platform: 'ios', 'android', 'web' |
| `needsTranscode` | boolean | ⚡ | Explicit flag if transcoding is needed |

⚡ = Recommended for optimal handling

### Performance Considerations

1. **Transcoding Latency**: AAC → PCM16 adds ~50-200ms per chunk
2. **Server Load**: FFmpeg transcoding uses CPU resources
3. **Error Handling**: If transcoding fails, a `voiceError` event is emitted with code `TRANSCODE_ERROR`

### Metrics

Session metrics now include transcoding statistics:

```javascript
socket.on('voiceChatEnded', (data) => {
  console.log('Session metrics:', data.metrics);
  // {
  //   audioChunksSent: 150,
  //   audioChunksReceived: 45,
  //   transcodeCount: 150,        // Number of chunks transcoded
  //   totalTranscodeTimeMs: 3000, // Total transcoding time
  //   avgTranscodeTimeMs: 20,     // Average transcoding time per chunk
  //   transcodeErrors: 0,         // Number of transcoding failures
  //   platform: 'android',        // Client platform
  //   durationMs: 45000,          // Session duration
  //   ...
  // }
});
```

### Error Handling

```javascript
socket.on('voiceError', (error) => {
  if (error.code === 'TRANSCODE_ERROR') {
    console.error('Audio transcoding failed:', error.message);
    // Consider:
    // 1. Retry the audio chunk
    // 2. Fall back to text input
    // 3. Show user-friendly error message
  }
});
```

---

## Socket Events Reference

### Events You EMIT (Client → Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `voiceChatStart` | `{ voice?, systemPrompt?, turnDetection? }` | Start voice session |
| `voiceChatEnd` | `{}` | End voice session |
| `voiceSessionUpdate` | `{ voice?, systemPrompt?, turnDetection? }` | Update session config |
| `voiceSessionStatus` | `{}` | Get session status |
| `voiceAudioAppend` | `{ audio, format?, sampleRate?, channels?, platform?, needsTranscode? }` | Send audio chunk (see below) |
| `voiceAudioCommit` | `{}` | Commit buffer (manual VAD only) |
| `voiceAudioClear` | `{}` | Clear audio buffer |
| `voiceCreateResponse` | `{}` | Trigger response (manual VAD only) |
| `voiceInterrupt` | `{}` | Stop AI mid-response |
| `voiceSendText` | `{ text: string }` | Send text (hybrid mode) |

### Events You LISTEN (Server → Client)

| Event | Payload | Description |
|-------|---------|-------------|
| `voiceSessionReady` | `{ sessionId, voice, turnDetection }` | Session connected |
| `voiceChatStartFailed` | `{ message }` | Failed to start session |
| `voiceChatEnded` | `{ metrics }` | Session ended |
| `voiceSpeechStarted` | `{ audioStartMs }` | User started speaking |
| `voiceSpeechStopped` | `{ audioEndMs }` | User stopped speaking |
| `voiceInputCommitted` | `{ itemId }` | Audio buffer committed |
| `voiceInputCleared` | `{}` | Audio buffer cleared |
| `voiceUserTranscript` | `{ text, itemId }` | User's speech transcribed |
| `voiceTranscriptFailed` | `{ itemId, error }` | Transcription failed |
| `voiceResponseStarted` | `{ responseId }` | AI started responding |
| `voiceAudioDelta` | `{ audio, responseId, itemId }` | AI audio chunk (base64) |
| `voiceTranscriptDelta` | `{ text, responseId, itemId }` | AI transcript chunk |
| `voiceAudioDone` | `{ responseId, itemId }` | AI finished sending audio |
| `voiceTranscriptDone` | `{ text, responseId, itemId }` | AI full transcript |
| `voiceResponseDone` | `{ responseId, status, usage }` | AI response complete |
| `voiceInterrupted` | `{}` | AI was interrupted |
| `voiceError` | `{ message, code, type }` | Error occurred |

---

## Integration Guide

### Step 1: Connect Socket

```javascript
import { io } from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  auth: {
    token: 'YOUR_AUTH_TOKEN'
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Step 2: Set Up Event Listeners

```javascript
// Session lifecycle
socket.on('voiceSessionReady', handleSessionReady);
socket.on('voiceChatStartFailed', handleStartFailed);
socket.on('voiceChatEnded', handleSessionEnded);

// Speech detection (VAD)
socket.on('voiceSpeechStarted', handleSpeechStarted);
socket.on('voiceSpeechStopped', handleSpeechStopped);

// Transcripts
socket.on('voiceUserTranscript', handleUserTranscript);
socket.on('voiceTranscriptDelta', handleAITranscriptChunk);
socket.on('voiceTranscriptDone', handleAITranscriptComplete);

// Audio streaming
socket.on('voiceAudioDelta', handleAudioChunk);
socket.on('voiceAudioDone', handleAudioComplete);

// Response lifecycle
socket.on('voiceResponseStarted', handleResponseStarted);
socket.on('voiceResponseDone', handleResponseComplete);

// Errors
socket.on('voiceError', handleError);
```

### Step 3: Start Voice Session

```javascript
function startVoiceChat() {
  socket.emit('voiceChatStart', {
    voice: 'alloy',           // Optional: AI voice
    turnDetection: true,      // Optional: Auto speech detection (recommended)
    systemPrompt: 'You are a friendly assistant.', // Optional
  });
}
```

### Step 4: Stream Audio

```javascript
// Send audio chunks as you record
// iOS (PCM16 - no transcoding needed)
function sendAudioChunk(pcm16Base64) {
  socket.emit('voiceAudioAppend', {
    audio: pcm16Base64,
    format: 'pcm16',
    platform: 'ios',
    needsTranscode: false,
  });
}

// Android (AAC - server will transcode to PCM16)
function sendAudioChunkAndroid(aacBase64) {
  socket.emit('voiceAudioAppend', {
    audio: aacBase64,
    format: 'aac',
    platform: 'android',
    needsTranscode: true,
  });
}
```

### Step 5: Handle AI Audio Response

```javascript
let audioQueue = [];

function handleAudioChunk(data) {
  // Add to queue for playback
  audioQueue.push(data.audio);
  playNextChunk();
}

async function playNextChunk() {
  if (audioQueue.length === 0) return;
  
  const base64Audio = audioQueue.shift();
  // Convert base64 to audio and play
  // (Platform-specific implementation)
}
```

### Step 6: End Session

```javascript
function endVoiceChat() {
  socket.emit('voiceChatEnd');
}
```

---

## React Native Implementation

### Complete Hook

```typescript
// hooks/useVoiceChat.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Socket } from 'socket.io-client';

interface VoiceChatState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isRecording: boolean;
  userTranscript: string;
  aiTranscript: string;
  error: string | null;
}

interface UseVoiceChatOptions {
  socket: Socket;
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
  systemPrompt?: string;
}

export function useVoiceChat({ socket, voice = 'alloy', systemPrompt }: UseVoiceChatOptions) {
  const [state, setState] = useState<VoiceChatState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    isRecording: false,
    userTranscript: '',
    aiTranscript: '',
    error: null,
  });

  const recordingRef = useRef<Audio.Recording | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // ─────────────────────────────────────────────────────────────
  // Socket Event Handlers
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Session ready
    socket.on('voiceSessionReady', (data) => {
      console.log('Voice session ready:', data);
      setState(prev => ({ ...prev, isConnected: true, error: null }));
    });

    // Start failed
    socket.on('voiceChatStartFailed', (data) => {
      console.error('Voice chat start failed:', data.message);
      setState(prev => ({ ...prev, error: data.message }));
    });

    // Session ended
    socket.on('voiceChatEnded', () => {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isListening: false,
        isSpeaking: false,
      }));
    });

    // Speech detection
    socket.on('voiceSpeechStarted', () => {
      setState(prev => ({ ...prev, isListening: true }));
    });

    socket.on('voiceSpeechStopped', () => {
      setState(prev => ({ ...prev, isListening: false }));
    });

    // User transcript
    socket.on('voiceUserTranscript', (data) => {
      setState(prev => ({ ...prev, userTranscript: data.text }));
    });

    // AI response started
    socket.on('voiceResponseStarted', () => {
      setState(prev => ({ ...prev, isSpeaking: true, aiTranscript: '' }));
    });

    // AI audio chunks
    socket.on('voiceAudioDelta', (data) => {
      audioQueueRef.current.push(data.audio);
      playNextAudioChunk();
    });

    // AI transcript chunks
    socket.on('voiceTranscriptDelta', (data) => {
      setState(prev => ({
        ...prev,
        aiTranscript: prev.aiTranscript + data.text,
      }));
    });

    // AI response complete
    socket.on('voiceResponseDone', () => {
      setState(prev => ({ ...prev, isSpeaking: false }));
    });

    // Errors
    socket.on('voiceError', (data) => {
      console.error('Voice error:', data);
      setState(prev => ({ ...prev, error: data.message }));
    });

    return () => {
      socket.off('voiceSessionReady');
      socket.off('voiceChatStartFailed');
      socket.off('voiceChatEnded');
      socket.off('voiceSpeechStarted');
      socket.off('voiceSpeechStopped');
      socket.off('voiceUserTranscript');
      socket.off('voiceResponseStarted');
      socket.off('voiceAudioDelta');
      socket.off('voiceTranscriptDelta');
      socket.off('voiceResponseDone');
      socket.off('voiceError');
    };
  }, [socket]);

  // ─────────────────────────────────────────────────────────────
  // Audio Playback
  // ─────────────────────────────────────────────────────────────

  const playNextAudioChunk = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    try {
      const base64Audio = audioQueueRef.current.shift()!;
      
      // Write to temp file
      const tempFile = `${FileSystem.cacheDirectory}voice_chunk_${Date.now()}.pcm`;
      await FileSystem.writeAsStringAsync(tempFile, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Play audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempFile },
        { shouldPlay: true }
      );

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          FileSystem.deleteAsync(tempFile, { idempotent: true });
          isPlayingRef.current = false;
          playNextAudioChunk(); // Play next chunk
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      isPlayingRef.current = false;
      playNextAudioChunk();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Recording
  // ─────────────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    try {
      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        throw new Error('Microphone permission denied');
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      // Start socket session
      socket.emit('voiceChatStart', {
        voice,
        systemPrompt,
        turnDetection: true,
      });

    } catch (error) {
      console.error('Error starting session:', error);
      setState(prev => ({ ...prev, error: (error as Error).message }));
    }
  }, [socket, voice, systemPrompt]);

  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      console.warn('Cannot record: session not connected');
      return;
    }

    try {
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.pcm',
          outputFormat: 0,
          audioEncoder: 0,
          sampleRate: 24000,
          numberOfChannels: 1,
          bitRate: 384000,
        },
        ios: {
          extension: '.pcm',
          audioQuality: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 24000,
          numberOfChannels: 1,
          bitRate: 384000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      });

      recordingRef.current = recording;
      setState(prev => ({ ...prev, isRecording: true }));

      // Poll for audio data
      const pollInterval = setInterval(async () => {
        if (!recordingRef.current) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const uri = recordingRef.current.getURI();
          if (uri) {
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            if (base64) {
              socket.emit('voiceAudioAppend', { audio: base64 });
            }
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 100); // 100ms chunks

    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [socket, state.isConnected]);

  const stopRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore
      }
      recordingRef.current = null;
    }
    setState(prev => ({ ...prev, isRecording: false }));
  }, []);

  const endSession = useCallback(async () => {
    await stopRecording();
    socket.emit('voiceChatEnd');
    audioQueueRef.current = [];
  }, [socket, stopRecording]);

  const interrupt = useCallback(() => {
    socket.emit('voiceInterrupt');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, [socket]);

  const sendText = useCallback((text: string) => {
    socket.emit('voiceSendText', { text });
  }, [socket]);

  return {
    ...state,
    startSession,
    endSession,
    startRecording,
    stopRecording,
    interrupt,
    sendText,
  };
}
```

### Usage Example

```typescript
// screens/VoiceChatScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { useSocket } from '../hooks/useSocket';

export function VoiceChatScreen() {
  const socket = useSocket();
  const {
    isConnected,
    isListening,
    isSpeaking,
    isRecording,
    userTranscript,
    aiTranscript,
    error,
    startSession,
    endSession,
    startRecording,
    stopRecording,
    interrupt,
  } = useVoiceChat({
    socket,
    voice: 'alloy',
    systemPrompt: 'You are a friendly AI assistant.',
  });

  return (
    <View style={styles.container}>
      {/* Status indicators */}
      <View style={styles.statusBar}>
        <Text>Session: {isConnected ? '🟢 Connected' : '⚪ Disconnected'}</Text>
        <Text>Listening: {isListening ? '👂 Yes' : 'No'}</Text>
        <Text>AI Speaking: {isSpeaking ? '🗣️ Yes' : 'No'}</Text>
      </View>

      {/* Transcripts */}
      <View style={styles.transcripts}>
        {userTranscript && (
          <View style={styles.userBubble}>
            <Text>You: {userTranscript}</Text>
          </View>
        )}
        {aiTranscript && (
          <View style={styles.aiBubble}>
            <Text>AI: {aiTranscript}</Text>
          </View>
        )}
      </View>

      {/* Error display */}
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!isConnected ? (
          <TouchableOpacity style={styles.button} onPress={startSession}>
            <Text>Start Voice Chat</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, isRecording && styles.recording]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Text>{isRecording ? '🎙️ Recording...' : '🎤 Hold to Talk'}</Text>
            </TouchableOpacity>

            {isSpeaking && (
              <TouchableOpacity style={styles.button} onPress={interrupt}>
                <Text>⏹️ Interrupt</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.endButton} onPress={endSession}>
              <Text>End Call</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  statusBar: { marginBottom: 20 },
  transcripts: { flex: 1 },
  userBubble: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  aiBubble: {
    backgroundColor: '#E5E5EA',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  error: { color: 'red', marginBottom: 10 },
  controls: { flexDirection: 'row', justifyContent: 'space-around' },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 30,
    minWidth: 100,
    alignItems: 'center',
  },
  recording: { backgroundColor: '#FF3B30' },
  endButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 30,
  },
});
```

---

## Flutter Implementation

### Voice Chat Service

```dart
// lib/services/voice_chat_service.dart
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';

enum VoiceChatState {
  disconnected,
  connecting,
  connected,
  listening,
  aiSpeaking,
}

class VoiceChatService {
  final IO.Socket socket;
  final String voice;
  final String? systemPrompt;

  VoiceChatState _state = VoiceChatState.disconnected;
  VoiceChatState get state => _state;

  String _userTranscript = '';
  String get userTranscript => _userTranscript;

  String _aiTranscript = '';
  String get aiTranscript => _aiTranscript;

  final _stateController = StreamController<VoiceChatState>.broadcast();
  Stream<VoiceChatState> get stateStream => _stateController.stream;

  final _userTranscriptController = StreamController<String>.broadcast();
  Stream<String> get userTranscriptStream => _userTranscriptController.stream;

  final _aiTranscriptController = StreamController<String>.broadcast();
  Stream<String> get aiTranscriptStream => _aiTranscriptController.stream;

  final _errorController = StreamController<String>.broadcast();
  Stream<String> get errorStream => _errorController.stream;

  final _audioRecord = Record();
  final _audioPlayer = AudioPlayer();
  final List<String> _audioQueue = [];
  bool _isPlaying = false;

  VoiceChatService({
    required this.socket,
    this.voice = 'alloy',
    this.systemPrompt,
  }) {
    _setupSocketListeners();
  }

  void _setupSocketListeners() {
    socket.on('voiceSessionReady', (data) {
      _updateState(VoiceChatState.connected);
    });

    socket.on('voiceChatStartFailed', (data) {
      _errorController.add(data['message'] ?? 'Failed to start');
      _updateState(VoiceChatState.disconnected);
    });

    socket.on('voiceChatEnded', (data) {
      _updateState(VoiceChatState.disconnected);
    });

    socket.on('voiceSpeechStarted', (data) {
      _updateState(VoiceChatState.listening);
    });

    socket.on('voiceSpeechStopped', (data) {
      if (_state == VoiceChatState.listening) {
        _updateState(VoiceChatState.connected);
      }
    });

    socket.on('voiceUserTranscript', (data) {
      _userTranscript = data['text'] ?? '';
      _userTranscriptController.add(_userTranscript);
    });

    socket.on('voiceResponseStarted', (data) {
      _aiTranscript = '';
      _updateState(VoiceChatState.aiSpeaking);
    });

    socket.on('voiceAudioDelta', (data) {
      _audioQueue.add(data['audio']);
      _playNextChunk();
    });

    socket.on('voiceTranscriptDelta', (data) {
      _aiTranscript += data['text'] ?? '';
      _aiTranscriptController.add(_aiTranscript);
    });

    socket.on('voiceResponseDone', (data) {
      _updateState(VoiceChatState.connected);
    });

    socket.on('voiceError', (data) {
      _errorController.add(data['message'] ?? 'Unknown error');
    });
  }

  void _updateState(VoiceChatState newState) {
    _state = newState;
    _stateController.add(newState);
  }

  Future<void> _playNextChunk() async {
    if (_isPlaying || _audioQueue.isEmpty) return;

    _isPlaying = true;
    final base64Audio = _audioQueue.removeAt(0);
    
    try {
      final bytes = base64Decode(base64Audio);
      // Convert PCM16 to playable format and play
      // This is simplified - you'll need proper audio conversion
      await _audioPlayer.play(BytesSource(bytes));
      
      _audioPlayer.onPlayerComplete.listen((_) {
        _isPlaying = false;
        _playNextChunk();
      });
    } catch (e) {
      _isPlaying = false;
      _playNextChunk();
    }
  }

  Future<void> startSession() async {
    _updateState(VoiceChatState.connecting);
    
    socket.emit('voiceChatStart', {
      'voice': voice,
      'systemPrompt': systemPrompt,
      'turnDetection': true,
    });
  }

  Future<void> startRecording() async {
    if (_state != VoiceChatState.connected && 
        _state != VoiceChatState.listening) return;

    if (await _audioRecord.hasPermission()) {
      await _audioRecord.start(
        encoder: AudioEncoder.pcm16bits,
        samplingRate: 24000,
        numChannels: 1,
      );

      // Stream audio chunks
      Timer.periodic(Duration(milliseconds: 100), (timer) async {
        if (!await _audioRecord.isRecording()) {
          timer.cancel();
          return;
        }

        final path = await _audioRecord.stop();
        if (path != null) {
          // Read and send audio
          // Restart recording immediately
          await _audioRecord.start(
            encoder: AudioEncoder.pcm16bits,
            samplingRate: 24000,
            numChannels: 1,
          );
        }
      });
    }
  }

  Future<void> stopRecording() async {
    await _audioRecord.stop();
  }

  void interrupt() {
    socket.emit('voiceInterrupt');
    _audioQueue.clear();
    _isPlaying = false;
    _audioPlayer.stop();
    _updateState(VoiceChatState.connected);
  }

  void sendText(String text) {
    socket.emit('voiceSendText', {'text': text});
  }

  void endSession() {
    socket.emit('voiceChatEnd');
    _audioQueue.clear();
    stopRecording();
    _updateState(VoiceChatState.disconnected);
  }

  void dispose() {
    _stateController.close();
    _userTranscriptController.close();
    _aiTranscriptController.close();
    _errorController.close();
    _audioRecord.dispose();
    _audioPlayer.dispose();
  }
}
```

---

## Web Implementation

### Voice Chat Hook

```typescript
// hooks/useVoiceChat.ts (Web)
import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface UseVoiceChatOptions {
  socket: Socket;
  voice?: string;
  systemPrompt?: string;
}

export function useVoiceChat({ socket, voice = 'alloy', systemPrompt }: UseVoiceChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [aiTranscript, setAiTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Socket event listeners
  useEffect(() => {
    socket.on('voiceSessionReady', () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on('voiceChatStartFailed', (data) => {
      setError(data.message);
    });

    socket.on('voiceChatEnded', () => {
      setIsConnected(false);
      setIsListening(false);
      setIsSpeaking(false);
    });

    socket.on('voiceSpeechStarted', () => setIsListening(true));
    socket.on('voiceSpeechStopped', () => setIsListening(false));
    socket.on('voiceUserTranscript', (data) => setUserTranscript(data.text));
    
    socket.on('voiceResponseStarted', () => {
      setIsSpeaking(true);
      setAiTranscript('');
    });

    socket.on('voiceAudioDelta', (data) => {
      decodeAndQueueAudio(data.audio);
    });

    socket.on('voiceTranscriptDelta', (data) => {
      setAiTranscript(prev => prev + data.text);
    });

    socket.on('voiceResponseDone', () => setIsSpeaking(false));
    socket.on('voiceError', (data) => setError(data.message));

    return () => {
      socket.off('voiceSessionReady');
      socket.off('voiceChatStartFailed');
      socket.off('voiceChatEnded');
      socket.off('voiceSpeechStarted');
      socket.off('voiceSpeechStopped');
      socket.off('voiceUserTranscript');
      socket.off('voiceResponseStarted');
      socket.off('voiceAudioDelta');
      socket.off('voiceTranscriptDelta');
      socket.off('voiceResponseDone');
      socket.off('voiceError');
    };
  }, [socket]);

  // Decode base64 PCM16 audio
  const decodeAndQueueAudio = async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert PCM16 to Float32
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    // Create AudioBuffer
    const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    audioQueueRef.current.push(audioBuffer);
    playNextChunk();
  };

  const playNextChunk = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    if (!audioContextRef.current) return;

    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextChunk();
    };
    source.start();
  };

  const startSession = useCallback(async () => {
    socket.emit('voiceChatStart', {
      voice,
      systemPrompt,
      turnDetection: true,
    });
  }, [socket, voice, systemPrompt]);

  const startRecording = useCallback(async () => {
    if (!isConnected) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // Convert to PCM16 base64 and send
          const arrayBuffer = await event.data.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          socket.emit('voiceAudioAppend', { audio: base64 });
        }
      };

      mediaRecorder.start(100); // 100ms chunks
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      setError('Microphone access denied');
    }
  }, [socket, isConnected]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const endSession = useCallback(() => {
    stopRecording();
    socket.emit('voiceChatEnd');
    audioQueueRef.current = [];
  }, [socket, stopRecording]);

  const interrupt = useCallback(() => {
    socket.emit('voiceInterrupt');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, [socket]);

  const sendText = useCallback((text: string) => {
    socket.emit('voiceSendText', { text });
  }, [socket]);

  return {
    isConnected,
    isListening,
    isSpeaking,
    isRecording,
    userTranscript,
    aiTranscript,
    error,
    startSession,
    endSession,
    startRecording,
    stopRecording,
    interrupt,
    sendText,
  };
}
```

---

## Voice Options

| Voice | Personality | Best For |
|-------|-------------|----------|
| `alloy` | Neutral, balanced | General use, professional |
| `ash` | Warm, friendly | Customer service, companionship |
| `ballad` | Expressive, storytelling | Narratives, entertainment |
| `coral` | Clear, articulate | Education, explanations |
| `echo` | Warm, conversational | Casual chats, social |
| `sage` | Wise, calm | Advice, meditation |
| `shimmer` | Soft, gentle | Relaxation, bedtime stories |
| `verse` | Dynamic, engaging | Interactive content |

---

## Best Practices

### 1. Handle Connection States

```typescript
// Always show connection state to user
if (!isConnected) {
  return <Text>Connecting to voice chat...</Text>;
}
```

### 2. Provide Visual Feedback

```typescript
// Show when AI is listening
{isListening && <AnimatedWave />}

// Show when AI is speaking
{isSpeaking && <SpeakingIndicator />}
```

### 3. Handle Errors Gracefully

```typescript
socket.on('voiceError', (error) => {
  switch (error.code) {
    case 'RATE_LIMIT':
      showToast('Too many requests. Please wait.');
      break;
    case 'INVALID_AUDIO':
      // Ignore or retry
      break;
    default:
      showToast(error.message);
  }
});
```

### 4. Optimize Audio Streaming

```typescript
// Use appropriate chunk sizes
const CHUNK_SIZE_MS = 100; // 100ms chunks recommended

// Buffer audio for smooth playback
const MIN_BUFFER_CHUNKS = 3;
```

### 5. Support Interruption

```typescript
// Allow user to interrupt AI
<TouchableOpacity onPress={interrupt}>
  <Text>Stop AI</Text>
</TouchableOpacity>
```

### 6. Clean Up Resources

```typescript
useEffect(() => {
  return () => {
    endSession();
    audioContext?.close();
  };
}, []);
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Authentication required" | Socket not authenticated | Check auth token |
| "Microphone permission denied" | User denied permission | Show permission prompt |
| No audio output | AudioContext not resumed | Resume on user gesture |
| Audio is choppy | Network latency | Increase buffer size |
| Session ends unexpectedly | Server timeout | Implement reconnection |
| "OpenAI API key not configured" | Server config issue | Check server env vars |

### Audio Not Playing (Web)

```typescript
// AudioContext must be resumed after user interaction
const resumeAudio = async () => {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
};

// Call on button click
<button onClick={resumeAudio}>Enable Audio</button>
```

### Permission Issues (Mobile)

```typescript
// iOS: Add to Info.plist
// NSMicrophoneUsageDescription: "We need microphone access for voice chat"

// Android: Add to AndroidManifest.xml
// <uses-permission android:name="android.permission.RECORD_AUDIO"/>
```

---

## Changelog

- **v1.1.0** - Android Audio Transcoding Support (January 2026)
  - Added server-side AAC to PCM16 transcoding using FFmpeg
  - Extended `voiceAudioAppend` payload with metadata fields
  - Added transcoding metrics to session statistics
  - Added `TRANSCODE_ERROR` error code for transcoding failures
  - Platform tracking in session metrics

- **v1.0.0** - Initial release with real-time voice chat
  - OpenAI Realtime API integration
  - Server-side VAD support
  - 8 voice options
  - Interruption support
  - Hybrid text/voice mode
