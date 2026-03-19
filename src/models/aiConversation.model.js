const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  tokens: {
    type: Number,
    default: 0,
  },
}, { _id: true, timestamps: true });

const aiConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New Chat',
    maxlength: 200,
    trim: true,
  },
  messages: [aiMessageSchema],
  // For context window management
  totalTokens: {
    type: Number,
    default: 0,
  },
  // AI configuration per conversation
  systemPrompt: {
    type: String,
    default: 'You are a helpful, friendly AI assistant. Be concise and helpful in your responses.',
  },
  model: {
    type: String,
    default: 'gpt-4o',
  },
  // Temperature for response creativity (0-2)
  temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 2,
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },
  // Last message preview for list display
  lastMessagePreview: {
    type: String,
    maxlength: 100,
  },
  lastMessageAt: {
    type: Date,
    index: true,
  },
}, { timestamps: true });

// Indexes for performance optimization
aiConversationSchema.index({ userId: 1, createdAt: -1 }); // User's conversations sorted
aiConversationSchema.index({ userId: 1, isArchived: 1, updatedAt: -1 }); // User's active/archived conversations
aiConversationSchema.index({ userId: 1, lastMessageAt: -1 }); // User's conversations by last message
aiConversationSchema.index({ title: 'text' }); // Text search on conversation title

// Update lastMessageAt and preview before saving
aiConversationSchema.pre('save', function updateLastMessage(next) {
  if (this.messages && this.messages.length > 0) {
    const lastMsg = this.messages[this.messages.length - 1];
    this.lastMessageAt = lastMsg.createdAt || new Date();
    this.lastMessagePreview = lastMsg.content.slice(0, 100);
  }
  next();
});

module.exports = mongoose.model('aiConversations', aiConversationSchema);
