# AI Chat Feature - Frontend Integration Guide

This document provides comprehensive documentation for integrating the AI Chat feature (ChatGPT-like conversational AI) into your frontend application.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Socket Events Reference](#socket-events-reference)
4. [Data Models](#data-models)
5. [Integration Guide](#integration-guide)
6. [Code Examples](#code-examples)
7. [Best Practices](#best-practices)
8. [Error Handling](#error-handling)

---

## Overview

The AI Chat feature provides a ChatGPT-like conversational experience using real-time Socket.IO connections. Key features include:

- **Real-time streaming responses** - See AI responses appear word-by-word
- **Conversation management** - Create, list, delete, and archive conversations
- **Message history** - Full persistence of all conversations
- **Stop generation** - Cancel AI responses mid-generation
- **Regenerate responses** - Re-generate the last AI response
- **Typing indicators** - Visual feedback while AI is generating

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Conversation │    │   Chat UI    │    │   Message    │      │
│  │    List      │    │  Component   │    │   Stream     │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                   │
│                      Socket.IO Client                           │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              │ WebSocket
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                      BACKEND                                     │
│                             │                                   │
│                      Socket.IO Server                           │
│                             │                                   │
│  ┌──────────────────────────┼───────────────────────────────┐  │
│  │              AI Chat Event Handlers                       │  │
│  └──────────────────────────┼───────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────┐    ┌──────┴───────┐    ┌──────────────┐      │
│  │   MongoDB    │◄───│  AI Service  │───►│   OpenAI     │      │
│  │  (History)   │    │              │    │    API       │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                                   │
│                      ┌──────┴───────┐                          │
│                      │    Redis     │                          │
│                      │   (Cache)    │                          │
│                      └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Socket Events Reference

### Conversation Management Events

#### `aiChatList` - Get Conversation List

Fetch paginated list of user's AI conversations.

**Emit:**
```javascript
socket.emit('aiChatList', {
  page: 1,              // optional, default: 1
  limit: 20,            // optional, default: 20, max: 50
  includeArchived: false // optional, default: false
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatListSuccess', (data) => {
  // data.conversations: Array of conversation summaries
  // data.pagination: { page, limit, total, totalPages, hasMore }
});

// Error
socket.on('aiChatListFailed', (error) => {
  // error.message: Error description
});
```

**Response Shape:**
```typescript
interface ConversationListResponse {
  conversations: {
    _id: string;
    title: string;
    lastMessagePreview: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
    isArchived: boolean;
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
```

---

#### `aiChatCreate` - Create New Conversation

Create a new AI conversation.

**Emit:**
```javascript
socket.emit('aiChatCreate', {
  title: 'My Chat',           // optional, default: 'New Chat'
  systemPrompt: 'You are...', // optional, custom AI personality
  model: 'gpt-4o',            // optional, default: 'gpt-4o'
  temperature: 0.7            // optional, 0-2, default: 0.7
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatCreateSuccess', (data) => {
  // data.conversation: { _id, title, createdAt, updatedAt }
});

// Error
socket.on('aiChatCreateFailed', (error) => {
  // error.message: Error description
});
```

---

#### `aiChatJoin` - Load Conversation

Load a conversation with full message history.

**Emit:**
```javascript
socket.emit('aiChatJoin', {
  conversationId: '...' // required
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatJoinSuccess', (data) => {
  // data.conversation: Full conversation with messages
});

// Error
socket.on('aiChatJoinFailed', (error) => {
  // error.message: Error description
});
```

**Response Shape:**
```typescript
interface ConversationJoinResponse {
  conversation: {
    _id: string;
    title: string;
    messages: {
      _id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      createdAt: Date;
      updatedAt: Date;
    }[];
    systemPrompt: string;
    model: string;
    temperature: number;
    createdAt: Date;
    updatedAt: Date;
  };
}
```

---

#### `aiChatDelete` - Delete Conversation

Permanently delete a conversation.

**Emit:**
```javascript
socket.emit('aiChatDelete', {
  conversationId: '...' // required
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatDeleteSuccess', (data) => {
  // data.conversationId: Deleted conversation ID
});

// Error
socket.on('aiChatDeleteFailed', (error) => {
  // error.message: Error description
});
```

---

#### `aiChatArchive` - Archive/Unarchive Conversation

Archive or unarchive a conversation.

**Emit:**
```javascript
socket.emit('aiChatArchive', {
  conversationId: '...', // required
  archive: true          // optional, default: true
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatArchiveSuccess', (data) => {
  // data.conversationId, data.isArchived
});

// Error
socket.on('aiChatArchiveFailed', (error) => {
  // error.message: Error description
});
```

---

#### `aiChatUpdateTitle` - Update Conversation Title

Update the title of a conversation.

**Emit:**
```javascript
socket.emit('aiChatUpdateTitle', {
  conversationId: '...', // required
  title: 'New Title'     // required
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatUpdateTitleSuccess', (data) => {
  // data.conversationId, data.title
});

// Error
socket.on('aiChatUpdateTitleFailed', (error) => {
  // error.message: Error description
});
```

---

#### `aiChatClearAll` - Clear All Conversations

Delete all conversations for the user.

**Emit:**
```javascript
socket.emit('aiChatClearAll', {
  confirm: true // required safety check
});
```

**Listen:**
```javascript
// Success
socket.on('aiChatClearAllSuccess', (data) => {
  // data.message: Confirmation message
});

// Error
socket.on('aiChatClearAllFailed', (error) => {
  // error.message: Error description
});
```

---

### Message Events

#### `aiSendMessage` - Send Message to AI

Send a message and receive streaming AI response.

**🚀 ChatGPT-like Experience:** If `conversationId` is omitted, a new conversation is **automatically created** from your first message! No need to manually create a conversation first.

**Emit:**
```javascript
// Option 1: Start a NEW conversation (ChatGPT-like - just start typing!)
socket.emit('aiSendMessage', {
  content: 'Hello, AI!'    // required, max 32000 chars
  // conversationId is OPTIONAL - will auto-create if not provided
});

// Option 2: Continue an EXISTING conversation
socket.emit('aiSendMessage', {
  conversationId: '...',   // optional - provide to continue existing chat
  content: 'Hello, AI!'    // required, max 32000 chars
});
```

**Listen (Multiple Events):**
```javascript
// Auto-created conversation (only emitted if conversationId was not provided)
socket.on('aiChatAutoCreated', (data) => {
  // data.conversation: { _id, title, createdAt, updatedAt }
  // IMPORTANT: Save this _id to continue the conversation!
});

// Typing indicator (AI is thinking/generating)
socket.on('aiTyping', (data) => {
  // data.conversationId
  // data.isTyping: boolean
});

// Streaming chunks (real-time response pieces)
socket.on('aiMessageChunk', (data) => {
  // data.conversationId
  // data.content: Partial response chunk
});

// Complete response
socket.on('aiMessageComplete', (data) => {
  // data.conversationId
  // data.content: Full response text
  // data.tokens: { prompt, completion }
  // data.isNewConversation: boolean (true if auto-created)
});

// Error
socket.on('aiSendMessageFailed', (error) => {
  // error.conversationId
  // error.message: Error description
});
```

---

#### `aiStopGeneration` - Stop AI Response

Stop the currently generating AI response.

**Emit:**
```javascript
socket.emit('aiStopGeneration', {
  conversationId: '...' // required
});
```

**Listen:**
```javascript
// Success
socket.on('aiGenerationStopped', (data) => {
  // data.conversationId
  // data.content: Partial response (if any)
  // data.reason: 'user_requested'
});

// Error (no active generation)
socket.on('aiStopGenerationFailed', (error) => {
  // error.conversationId
  // error.message: Error description
});
```

---

#### `aiRegenerate` - Regenerate Last Response

Regenerate the last AI response.

**Emit:**
```javascript
socket.emit('aiRegenerate', {
  conversationId: '...' // required
});
```

**Listen:**
```javascript
// Same streaming events as aiSendMessage:
// - aiTyping
// - aiMessageChunk

// Success (instead of aiMessageComplete)
socket.on('aiRegenerateSuccess', (data) => {
  // data.conversationId
  // data.content: New full response
  // data.tokens: { prompt, completion }
});

// Error
socket.on('aiRegenerateFailed', (error) => {
  // error.conversationId
  // error.message: Error description
});
```

---

## Data Models

### Conversation

```typescript
interface AIConversation {
  _id: string;
  userId: string;
  title: string;
  messages: AIMessage[];
  totalTokens: number;
  systemPrompt: string;
  model: string;
  temperature: number;
  isArchived: boolean;
  lastMessagePreview: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Message

```typescript
interface AIMessage {
  _id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Integration Guide

### Step 1: Socket Connection

Ensure your socket is connected and authenticated before using AI chat events.

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

Set up all necessary event listeners before emitting events.

```javascript
// Conversation list
socket.on('aiChatListSuccess', handleConversationList);
socket.on('aiChatListFailed', handleError);

// Create conversation
socket.on('aiChatCreateSuccess', handleConversationCreated);
socket.on('aiChatCreateFailed', handleError);

// Join conversation
socket.on('aiChatJoinSuccess', handleConversationJoined);
socket.on('aiChatJoinFailed', handleError);

// Message streaming
socket.on('aiTyping', handleTypingIndicator);
socket.on('aiMessageChunk', handleMessageChunk);
socket.on('aiMessageComplete', handleMessageComplete);
socket.on('aiSendMessageFailed', handleError);

// Stop/Regenerate
socket.on('aiGenerationStopped', handleGenerationStopped);
socket.on('aiRegenerateSuccess', handleRegenerateSuccess);
```

### Step 3: Implement Streaming UI

The key to a ChatGPT-like experience is handling streaming responses:

```javascript
let currentResponse = '';

function handleTypingIndicator(data) {
  if (data.isTyping) {
    showTypingIndicator();
    currentResponse = ''; // Reset for new response
  } else {
    hideTypingIndicator();
  }
}

function handleMessageChunk(data) {
  currentResponse += data.content;
  updateMessageUI(currentResponse);
}

function handleMessageComplete(data) {
  // Final complete response
  currentResponse = data.content;
  finalizeMessage(currentResponse);
}
```

---

## Code Examples

### React Hook Example

```typescript
// useAIChat.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface UseAIChatOptions {
  socket: Socket;
  conversationId: string | null;
}

export function useAIChat({ socket, conversationId }: UseAIChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingContentRef = useRef('');

  // Handle typing indicator
  useEffect(() => {
    const handleTyping = (data: { isTyping: boolean }) => {
      setIsTyping(data.isTyping);
      if (data.isTyping) {
        streamingContentRef.current = '';
      }
    };
    
    socket.on('aiTyping', handleTyping);
    return () => { socket.off('aiTyping', handleTyping); };
  }, [socket]);

  // Handle streaming chunks
  useEffect(() => {
    const handleChunk = (data: { content: string }) => {
      streamingContentRef.current += data.content;
      
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: streamingContentRef.current }
          ];
        }
        return [
          ...prev,
          {
            id: `streaming-${Date.now()}`,
            role: 'assistant',
            content: streamingContentRef.current,
            isStreaming: true
          }
        ];
      });
    };
    
    socket.on('aiMessageChunk', handleChunk);
    return () => { socket.off('aiMessageChunk', handleChunk); };
  }, [socket]);

  // Handle complete message
  useEffect(() => {
    const handleComplete = (data: { content: string }) => {
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isStreaming);
        return [
          ...filtered,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: data.content,
            isStreaming: false
          }
        ];
      });
      setIsLoading(false);
    };
    
    socket.on('aiMessageComplete', handleComplete);
    return () => { socket.off('aiMessageComplete', handleComplete); };
  }, [socket]);

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!conversationId || !content.trim()) return;
    
    // Add user message immediately
    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim()
      }
    ]);
    
    setIsLoading(true);
    setError(null);
    
    socket.emit('aiSendMessage', {
      conversationId,
      content: content.trim()
    });
  }, [socket, conversationId]);

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (!conversationId) return;
    socket.emit('aiStopGeneration', { conversationId });
  }, [socket, conversationId]);

  // Regenerate last response
  const regenerate = useCallback(() => {
    if (!conversationId) return;
    
    // Remove last assistant message
    setMessages(prev => {
      const lastAssistantIdx = prev.findLastIndex(m => m.role === 'assistant');
      if (lastAssistantIdx > -1) {
        return prev.slice(0, lastAssistantIdx);
      }
      return prev;
    });
    
    setIsLoading(true);
    socket.emit('aiRegenerate', { conversationId });
  }, [socket, conversationId]);

  return {
    messages,
    isLoading,
    isTyping,
    error,
    sendMessage,
    stopGeneration,
    regenerate
  };
}
```

### React Native Example

```typescript
// AIChatScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSocket } from '../hooks/useSocket';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const AIChatScreen: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const socket = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Load conversation
    socket.emit('aiChatJoin', { conversationId });

    socket.on('aiChatJoinSuccess', (data) => {
      const formattedMessages = data.conversation.messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({
          id: m._id,
          role: m.role,
          content: m.content,
        }));
      setMessages(formattedMessages);
    });

    socket.on('aiTyping', (data) => {
      setIsTyping(data.isTyping);
      if (data.isTyping) {
        setStreamingContent('');
      }
    });

    socket.on('aiMessageChunk', (data) => {
      setStreamingContent(prev => prev + data.content);
    });

    socket.on('aiMessageComplete', (data) => {
      setStreamingContent('');
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.content,
        },
      ]);
    });

    return () => {
      socket.off('aiChatJoinSuccess');
      socket.off('aiTyping');
      socket.off('aiMessageChunk');
      socket.off('aiMessageComplete');
    };
  }, [socket, conversationId]);

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    socket.emit('aiSendMessage', {
      conversationId,
      content: input.trim(),
    });
  };

  const stopGeneration = () => {
    socket.emit('aiStopGeneration', { conversationId });
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageContainer,
      item.role === 'user' ? styles.userMessage : styles.assistantMessage,
    ]}>
      <Text style={styles.messageText}>{item.content}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListFooterComponent={
          <>
            {streamingContent ? (
              <View style={[styles.messageContainer, styles.assistantMessage]}>
                <Text style={styles.messageText}>{streamingContent}</Text>
              </View>
            ) : null}
            {isTyping && !streamingContent ? (
              <View style={styles.typingIndicator}>
                <ActivityIndicator size="small" />
                <Text style={styles.typingText}>AI is thinking...</Text>
              </View>
            ) : null}
          </>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          multiline
          editable={!isTyping}
        />
        {isTyping ? (
          <TouchableOpacity style={styles.stopButton} onPress={stopGeneration}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  typingText: {
    marginLeft: 8,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  stopButton: {
    marginLeft: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
```

### Flutter Example

```dart
// ai_chat_service.dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class AIChatService {
  final IO.Socket socket;
  final String conversationId;
  
  Function(String)? onChunk;
  Function(String)? onComplete;
  Function(bool)? onTyping;
  Function(String)? onError;
  
  String _streamingContent = '';
  
  AIChatService({
    required this.socket,
    required this.conversationId,
  }) {
    _setupListeners();
  }
  
  void _setupListeners() {
    socket.on('aiTyping', (data) {
      final isTyping = data['isTyping'] as bool;
      if (isTyping) {
        _streamingContent = '';
      }
      onTyping?.call(isTyping);
    });
    
    socket.on('aiMessageChunk', (data) {
      _streamingContent += data['content'] as String;
      onChunk?.call(_streamingContent);
    });
    
    socket.on('aiMessageComplete', (data) {
      onComplete?.call(data['content'] as String);
    });
    
    socket.on('aiSendMessageFailed', (data) {
      onError?.call(data['message'] as String);
    });
  }
  
  void sendMessage(String content) {
    socket.emit('aiSendMessage', {
      'conversationId': conversationId,
      'content': content,
    });
  }
  
  void stopGeneration() {
    socket.emit('aiStopGeneration', {
      'conversationId': conversationId,
    });
  }
  
  void regenerate() {
    socket.emit('aiRegenerate', {
      'conversationId': conversationId,
    });
  }
  
  void dispose() {
    socket.off('aiTyping');
    socket.off('aiMessageChunk');
    socket.off('aiMessageComplete');
    socket.off('aiSendMessageFailed');
  }
}
```

---

## Best Practices

### 1. Message ID Management

Always use unique IDs for messages, especially when handling streaming:

```javascript
// Use conversation ID + timestamp for uniqueness
const messageId = `${conversationId}-${Date.now()}-${role}`;
```

### 2. Scroll Handling

Auto-scroll to bottom during streaming, but respect user scroll position:

```javascript
const shouldAutoScroll = () => {
  const scrollContainer = containerRef.current;
  const threshold = 100; // pixels from bottom
  return (
    scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < threshold
  );
};
```

### 3. Error Recovery

Implement retry logic for failed messages:

```javascript
const sendWithRetry = async (content, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sendMessage(content);
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
};
```

### 4. Optimistic Updates

Show user messages immediately, don't wait for server confirmation:

```javascript
// Add to UI immediately
addMessage({ role: 'user', content, status: 'sending' });

// Update status on success/failure
socket.on('aiMessageComplete', () => {
  updateMessageStatus(messageId, 'sent');
});
```

### 5. Memory Management

Clean up event listeners when components unmount:

```javascript
useEffect(() => {
  const handlers = {
    aiTyping: handleTyping,
    aiMessageChunk: handleChunk,
    aiMessageComplete: handleComplete,
  };
  
  Object.entries(handlers).forEach(([event, handler]) => {
    socket.on(event, handler);
  });
  
  return () => {
    Object.entries(handlers).forEach(([event, handler]) => {
      socket.off(event, handler);
    });
  };
}, []);
```

---

## Error Handling

### Common Error Codes

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Authentication required` | Socket not authenticated | Ensure valid auth token |
| `conversationId is required` | Missing conversation ID | Check payload structure |
| `Conversation not found` | Invalid or deleted conversation | Reload conversation list |
| `Message content is required` | Empty message | Validate input before sending |
| `Message too long` | Exceeds 32000 chars | Truncate or split message |
| `OpenAI API key not configured` | Server misconfiguration | Contact admin |
| `A response is already being generated` | Duplicate send | Wait or stop current generation |

### Error Handling Pattern

```javascript
// Centralized error handler
function handleAIError(error, context) {
  console.error(`AI Chat Error [${context}]:`, error.message);
  
  switch (error.message) {
    case 'Authentication required':
      // Redirect to login
      break;
    case 'Conversation not found':
      // Refresh conversation list
      refreshConversations();
      break;
    case 'A response is already being generated':
      // Show "stop" button
      showStopButton();
      break;
    default:
      // Show generic error toast
      showToast(error.message);
  }
}
```

---

## Event Flow Diagrams

### Send Message Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │     │ Server │     │ OpenAI │     │   DB   │
└───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘
    │              │              │              │
    │ aiSendMessage│              │              │
    │─────────────>│              │              │
    │              │              │              │
    │   aiTyping   │              │              │
    │<─────────────│              │              │
    │  (isTyping:  │              │              │
    │    true)     │    API Call  │              │
    │              │─────────────>│              │
    │              │              │              │
    │              │   Stream     │              │
    │              │<─ ─ ─ ─ ─ ─ ─│              │
    │aiMessageChunk│              │              │
    │<─────────────│              │              │
    │              │              │              │
    │aiMessageChunk│              │              │
    │<─────────────│              │              │
    │      ...     │              │              │
    │              │              │   Save       │
    │              │─────────────────────────────>│
    │aiMessageComplete              │              │
    │<─────────────│              │              │
    │              │              │              │
    │   aiTyping   │              │              │
    │<─────────────│              │              │
    │  (isTyping:  │              │              │
    │    false)    │              │              │
```

### Stop Generation Flow

```
┌────────┐     ┌────────┐     ┌────────┐
│ Client │     │ Server │     │ OpenAI │
└───┬────┘     └───┬────┘     └───┬────┘
    │              │              │
    │   (streaming in progress)   │
    │aiMessageChunk│              │
    │<─────────────│<─ ─ ─ ─ ─ ─ ─│
    │              │              │
    │aiStopGeneration              │
    │─────────────>│              │
    │              │    Abort     │
    │              │─ ─ ─ ─ ─ ─ ─>│
    │              │              │
    │aiGenerationStopped           │
    │<─────────────│              │
    │              │              │
    │   aiTyping   │              │
    │<─────────────│              │
    │  (isTyping:  │              │
    │    false)    │              │
```

---

## Changelog

- **v1.0.0** - Initial release with core AI chat functionality
  - Conversation CRUD operations
  - Real-time streaming responses
  - Stop/regenerate functionality
  - Redis caching for active conversations

