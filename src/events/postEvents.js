const { socketEvents } = require('../../lib/constants/socket');
const postServices = require('../services/postServices');
const hashtagServices = require('../services/hashtagServices');

/**
 * Handle add impression event
 * Client emits 'addImpression' with { postId } or { hashtagId } in body
 * Server increments viewCount for that post/hashtag and emits 'impressionAdded' back
 */
exports.handleAddImpression = async (socket, data) => {
  try {
    const { postId, hashtagId } = data || {};

    // Handle hashtag impression
    if (hashtagId) {
      const updatedHashtag = await hashtagServices.incrementViewCount({ hashtagId });

      if (!updatedHashtag) {
        socket.emit(socketEvents.ADD_IMPRESSION_FAILED, {
          message: 'Hashtag not found',
        });
        return;
      }

      // Emit success to the client that sent the impression
      socket.emit(socketEvents.ADD_IMPRESSION_SUCCESS, {
        hashtagId,
        viewCount: updatedHashtag.viewCount,
      });

      // Emit impressionAdded event (can be used by the client to update UI)
      socket.emit(socketEvents.IMPRESSION_ADDED, {
        hashtagId,
        viewCount: updatedHashtag.viewCount,
      });
      return;
    }

    // Handle post impression
    if (postId) {
      const updatedPost = await postServices.incrementViewCount({ postId });

      if (!updatedPost) {
        socket.emit(socketEvents.ADD_IMPRESSION_FAILED, {
          message: 'Post not found',
        });
        return;
      }

      // Emit success to the client that sent the impression
      socket.emit(socketEvents.ADD_IMPRESSION_SUCCESS, {
        postId,
        viewCount: updatedPost.viewCount,
      });

      // Emit impressionAdded event (can be used by the client to update UI)
      socket.emit(socketEvents.IMPRESSION_ADDED, {
        postId,
        viewCount: updatedPost.viewCount,
      });
      return;
    }

    // Neither postId nor hashtagId provided
    socket.emit(socketEvents.ADD_IMPRESSION_FAILED, {
      message: 'postId or hashtagId is required',
    });
  } catch (error) {
    console.error('Error handling addImpression:', error);
    socket.emit(socketEvents.ADD_IMPRESSION_FAILED, {
      message: error.message || 'Failed to add impression',
    });
  }
};
