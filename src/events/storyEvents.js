const { Types } = require('mongoose');
const { socketEvents } = require('../../lib/constants/socket');
const storiesServices = require('../services/storiesServices');
const { getIO } = require('./socketInstance');

const { ObjectId } = Types;

const toIdStr = (id) => (id ? String(id) : '');

exports.handleStoryFeedSubscribe = async (socket) => {
  try {
    const { userId } = socket.handshake?.query || {};
    if (!userId) {
      socket.emit(socketEvents.STORY_FEED_SUBSCRIBE_FAILED, { message: 'userId missing' });
      return;
    }

    // Optional room for story-feed specific pushes (in addition to userId room)
    const room = `storiesFeed:${toIdStr(userId)}`;
    socket.join(room);

    socket.emit(socketEvents.STORY_FEED_SUBSCRIBE_SUCCESS, { room });
  } catch (error) {
    socket.emit(socketEvents.STORY_FEED_SUBSCRIBE_FAILED, { message: error.message || 'Failed to subscribe' });
  }
};

exports.handleStoryView = async (socket, data) => {
  try {
    const { userId } = socket.handshake?.query || {};
    const { storyId } = data || {};
    if (!userId || !storyId) {
      socket.emit(socketEvents.STORY_VIEW_FAILED, { message: 'storyId is required' });
      return;
    }

    const result = await storiesServices.recordStoryView({
      storyId,
      viewerId: new ObjectId(userId),
    });

    if (!result.ok) {
      const msg = result.reason === 'not_found' ? 'Story not found' : 'You are not allowed to view this story';
      socket.emit(socketEvents.STORY_VIEW_FAILED, { message: msg, reason: result.reason });
      return;
    }

    socket.emit(socketEvents.STORY_VIEW_SUCCESS, {
      storyId: toIdStr(storyId),
      inserted: !!result.inserted,
      viewCount: result.story?.viewCount || 0,
    });

    const io = getIO();
    if (io && result.story?.userId) {
      io.to(toIdStr(result.story.userId)).emit(socketEvents.STORY_VIEWERS_UPDATED, {
        storyId: toIdStr(storyId),
        viewCount: result.story?.viewCount || 0,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.STORY_VIEW_FAILED, { message: error.message || 'Failed to record story view' });
  }
};

exports.handleStoryReaction = async (socket, data) => {
  try {
    const { userId } = socket.handshake?.query || {};
    const { storyId, emoji } = data || {};
    if (!userId || !storyId || !emoji) {
      socket.emit(socketEvents.STORY_REACTION_FAILED, { message: 'storyId and emoji are required' });
      return;
    }

    const result = await storiesServices.addStoryReaction({
      storyId,
      viewerId: new ObjectId(userId),
      emoji,
    });

    if (!result.ok) {
      const msg = result.reason === 'not_found' ? 'Story not found' : 'You are not allowed to react to this story';
      socket.emit(socketEvents.STORY_REACTION_FAILED, { message: msg, reason: result.reason });
      return;
    }

    socket.emit(socketEvents.STORY_REACTION_SUCCESS, {
      storyId: toIdStr(storyId),
      reactionCount: result.story?.reactionCount || 0,
      viewCount: result.story?.viewCount || 0,
    });

    const io = getIO();
    if (io && result.story?.userId) {
      io.to(toIdStr(result.story.userId)).emit(socketEvents.STORY_REACTIONS_UPDATED, {
        storyId: toIdStr(storyId),
        reactionCount: result.story?.reactionCount || 0,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.STORY_REACTION_FAILED, { message: error.message || 'Failed to react to story' });
  }
};

exports.handleStoryDelete = async (socket, data) => {
  try {
    const { userId } = socket.handshake?.query || {};
    const { storyId } = data || {};
    if (!userId || !storyId) {
      socket.emit(socketEvents.STORY_DELETE_FAILED, { message: 'storyId is required' });
      return;
    }

    const story = await storiesServices.findById({ id: storyId });
    if (!story) {
      socket.emit(socketEvents.STORY_DELETE_FAILED, { message: 'Story not found' });
      return;
    }

    if (!story.userId || toIdStr(story.userId) !== toIdStr(userId)) {
      socket.emit(socketEvents.STORY_DELETE_FAILED, { message: 'You do not have permission to delete this story' });
      return;
    }

    const updatedStory = await storiesServices.findByIdAndUpdate({
      id: storyId,
      body: {
        isActive: false,
        isHighlight: false,
        $unset: { collectionId: 1, highlightCollectionId: 1 },
      },
    });

    socket.emit(socketEvents.STORY_DELETE_SUCCESS, { storyId: toIdStr(storyId), isActive: false });

    const io = getIO();
    if (io && updatedStory?.userId) {
      io.to(toIdStr(updatedStory.userId)).emit(socketEvents.STORY_REEL_UPDATED, {
        ownerId: toIdStr(updatedStory.userId),
        storyId: toIdStr(storyId),
      });
    }
  } catch (error) {
    socket.emit(socketEvents.STORY_DELETE_FAILED, { message: error.message || 'Failed to delete story' });
  }
};
