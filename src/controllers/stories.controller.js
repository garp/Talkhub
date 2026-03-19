const { Types } = require('mongoose');
const storiesServices = require('../services/storiesServices');
const highlightCollectionServices = require('../services/highlightCollectionServices');
const userServices = require('../services/userServices');
const followServices = require('../services/followServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');
const thumbnailGenerator = require('../../lib/helpers/thumbnailGenerator');
const { socketEvents } = require('../../lib/constants/socket');
const { sendStoryNotification } = require('../services/pushNotificationService');
const hashtagServices = require('../services/hashtagServices');

const { ObjectId } = Types;

const parseJsonIfString = (value, fallback = null) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return fallback;
    }
  }
  return value;
};

const toIdStr = (id) => (id ? String(id) : '');

const blockedUsersContains = (blockedUsers, otherUserId) => {
  const otherIdStr = toIdStr(otherUserId);
  return (blockedUsers || []).some((b) => toIdStr(b?.userId || b) === otherIdStr);
};

exports.create = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    isHighlight,
    hashtagId,
    audience,
    caption,
    mentionUserIds,
    linkSticker,
    interactive,
  } = req.body;

  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Story file is required',
    });
  }

  // Get file URL from the uploaded file
  const storyUrl = req.file.location;
  let thumbnailUrl;
  let fileType;

  // Determine file type and handle accordingly
  try {
    console.log('Processing file with mimetype:', req.file.mimetype);

    if (thumbnailGenerator.isVideo(req.file.mimetype)) {
      console.log('File is a video, generating thumbnail...');
      // For videos, generate a thumbnail
      thumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(req.file);
      fileType = 'video';
      console.log('Video thumbnail generated successfully');
    } else if (thumbnailGenerator.isImage(req.file.mimetype)) {
      console.log('File is an image, using same URL for thumbnail');
      // For images, use the same URL for thumbnail
      thumbnailUrl = storyUrl;
      fileType = 'image';
    } else {
      console.log('Unsupported file type:', req.file.mimetype);
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only images and videos are allowed.',
      });
    }
  } catch (error) {
    console.error('Error processing file:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing the uploaded file',
      error: error.message,
    });
  }

  // Create story data object
  const parsedIsHighlightRaw = parseJsonIfString(isHighlight, isHighlight);
  const parsedIsHighlight = parsedIsHighlightRaw !== undefined && parsedIsHighlightRaw !== null
    ? !!parsedIsHighlightRaw
    : undefined;

  const parsedMentionUserIds = (() => {
    const raw = parseJsonIfString(mentionUserIds, mentionUserIds);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [];
  })();

  const parsedLinkSticker = parseJsonIfString(linkSticker, linkSticker) || undefined;
  const parsedInteractive = parseJsonIfString(interactive, interactive) || undefined;

  const storyData = {
    userId,
    storyUrl,
    thumbnailUrl,
    type: fileType,
    storyFrom: hashtagId ? 'hashtag' : 'user',
    ...(hashtagId && { hashtagId }),
    ...(parsedIsHighlight !== undefined && { isHighlight: parsedIsHighlight }),
    ...(audience && { audience }),
    ...(caption !== undefined && { caption }),
    ...(parsedMentionUserIds && parsedMentionUserIds.length && { mentionUserIds: parsedMentionUserIds }),
    ...(parsedLinkSticker && { linkSticker: parsedLinkSticker }),
    ...(parsedInteractive && { interactive: parsedInteractive }),
  };

  const story = await storiesServices.create(storyData);

  // Realtime: notify eligible followers that owner has a new story
  try {
    const io = req.app.get('io');
    if (io && story && story.storyFrom === 'user') {
      const owner = await userServices.findOne({
        filter: { _id: new ObjectId(userId) },
        projection: {
          closeFriends: 1, storyHiddenFrom: 1, blockedUsers: 1, fullName: 1,
        },
      });

      const follows = await followServices.find({
        filter: { followingId: new ObjectId(userId), status: 'accepted' },
        projection: { followerId: 1 },
      });
      const followerIds = (follows || []).map((f) => f.followerId).filter(Boolean);

      const closeFriendsSet = new Set((owner?.closeFriends || []).map((id) => toIdStr(id)));
      const hiddenSet = new Set((owner?.storyHiddenFrom || []).map((id) => toIdStr(id)));

      const recipients = followerIds.filter((fid) => {
        const fidStr = toIdStr(fid);
        if (!fidStr) return false;
        if (hiddenSet.has(fidStr)) return false;
        if (blockedUsersContains(owner?.blockedUsers || [], fid)) return false;
        if (story.audience === 'close_friends') return closeFriendsSet.has(fidStr);
        return true;
      });

      // Find users who have muted this owner's stories — exclude from socket emission
      const mutersResult = await userServices.find({
        filter: {
          'storyMutedUsers.userId': new ObjectId(userId),
          _id: { $in: recipients.map((r) => new ObjectId(toIdStr(r))) },
        },
        projection: { _id: 1 },
      });
      const muterSet = new Set((mutersResult || []).map((u) => toIdStr(u._id)));

      const socketRecipients = recipients.filter((rid) => !muterSet.has(toIdStr(rid)));

      socketRecipients.forEach((rid) => {
        io.to(toIdStr(rid)).emit(socketEvents.NEW_STORY_REEL, {
          ownerId: toIdStr(userId),
          storyId: toIdStr(story._id),
          latestStoryAt: story.createdAt,
        });
      });

      // Also update owner’s own client if needed
      io.to(toIdStr(userId)).emit(socketEvents.STORY_REEL_UPDATED, {
        ownerId: toIdStr(userId),
        storyId: toIdStr(story._id),
        latestStoryAt: story.createdAt,
      });

      // Push notifications: send to followers who enabled story notifications for this owner
      try {
        const notifyUsersResult = await userServices.find({
          filter: {
            'storyNotifyUsers.userId': new ObjectId(userId),
            _id: { $in: socketRecipients.map((r) => new ObjectId(toIdStr(r))) },
            fcmToken: { $exists: true, $ne: null },
          },
          projection: { _id: 1, fcmToken: 1 },
        });

        if (notifyUsersResult && notifyUsersResult.length > 0) {
          const ownerName = owner?.fullName || 'Someone';
          await Promise.allSettled(
            notifyUsersResult.map((u) => sendStoryNotification({
              fcmToken: u.fcmToken,
              ownerName,
              ownerId: toIdStr(userId),
              storyId: toIdStr(story._id),
              thumbnailUrl: story.thumbnailUrl,
            })),
          );
        }
      } catch (notifyErr) {
        console.error('Failed to send story push notifications:', notifyErr?.message || notifyErr);
      }
    }
  } catch (e) {
    // best-effort
    console.error('Failed to emit NEW_STORY_REEL:', e?.message || e);
  }

  return responseHandler({ story }, res);
});

exports.getStoriesFeed = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const viewerObjectId = new ObjectId(userId);

  const currentUser = await userServices.findOne({
    filter: { _id: viewerObjectId },
    projection: {
      blockedUsers: 1, mutedUsers: 1, storyMutedUsers: 1, storyNotifyUsers: 1,
    },
  });

  const blockedUserIds = (currentUser?.blockedUsers || []).map((b) => b?.userId).filter(Boolean);
  const mutedUserIds = (currentUser?.mutedUsers || []).map((m) => m?.userId).filter(Boolean);
  const storyMutedUserIds = (currentUser?.storyMutedUsers || []).map((m) => m?.userId).filter(Boolean);

  // Build sets for quick lookup when enriching reels
  const storyMutedSet = new Set(storyMutedUserIds.map((id) => toIdStr(id)));
  const storyNotifySet = new Set(
    (currentUser?.storyNotifyUsers || []).map((n) => toIdStr(n?.userId)).filter(Boolean),
  );

  const followingList = await followServices.find({
    filter: { followerId: viewerObjectId, status: 'accepted' },
    projection: { followingId: 1 },
  });

  const followingIds = (followingList || [])
    .map((f) => f.followingId)
    .filter((id) => {
      const idStr = toIdStr(id);
      if (!idStr) return false;
      if (blockedUserIds.some((b) => toIdStr(b) === idStr)) return false;
      if (mutedUserIds.some((m) => toIdStr(m) === idStr)) return false;
      // Exclude story-muted users from the feed
      if (storyMutedSet.has(idStr)) return false;
      return true;
    });

  const reels = await storiesServices.getStoriesFeedForViewer({
    viewerId: viewerObjectId,
    followingIds,
  });

  // Collect all story IDs across reels to batch-fetch like status
  const allStoryIds = (reels || [])
    .flatMap((r) => (r.stories || []).map((s) => s._id))
    .filter(Boolean);
  const likedSet = await storiesServices.getLikedStoryIdsByViewer({
    storyIds: allStoryIds,
    viewerId: viewerObjectId,
  });

  // Collect own-story IDs to batch-fetch their view lists
  const ownStoryIds = (reels || [])
    .filter((r) => r.isOwnStory)
    .flatMap((r) => (r.stories || []).map((s) => s._id))
    .filter(Boolean);
  const viewListMap = await storiesServices.getStoryViewListsByStoryIds({
    storyIds: ownStoryIds,
  });

  // Stamp isLiked on every story + viewList on own stories + mute/notify flags per reel
  const enrichedReels = (reels || []).map((r) => {
    const reelOwnerId = toIdStr(r.userId || r.ownerId || r._id);
    return {
      ...r,
      isStoryMuted: storyMutedSet.has(reelOwnerId),
      isStoryNotifyEnabled: storyNotifySet.has(reelOwnerId),
      stories: (r.stories || []).map((s) => ({
        ...s,
        isLiked: likedSet.has(toIdStr(s._id)),
        ...(r.isOwnStory ? { viewList: viewListMap.get(toIdStr(s._id)) || [] } : {}),
      })),
    };
  });

  return responseHandler({ reels: enrichedReels }, res);
});

exports.getStory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyFrom, grouped, includeArchived } = req.query;
  const filter = {
  };

  // By default, stories endpoints return only active stories.
  // includeArchived=true is allowed only for requesting own user stories.
  const includeArchivedBool = includeArchived === 'true' || includeArchived === true;
  if (!includeArchivedBool) {
    filter.isActive = true;
  }

  if (storyFrom === 'hashtag') {
    filter.storyFrom = 'hashtag';
    filter.hashtagId = new ObjectId(req.query.hashtagId);
  } else if (storyFrom === 'user') {
    filter.storyFrom = 'user';
    const requestedUserId = req.query.userId ? new ObjectId(req.query.userId) : new ObjectId(userId);
    filter.userId = requestedUserId;

    // Safety: only allow includeArchived for self
    if (includeArchivedBool && toIdStr(requestedUserId) !== toIdStr(userId)) {
      filter.isActive = true;
    }
  }

  // Check if grouped by collection is requested
  if (grouped === 'true' || grouped === true) {
    const storiesGrouped = await storiesServices.findGroupedByCollection({ filter });

    // Collect all story IDs across groups to batch-fetch like status
    const allGroupedStoryIds = (storiesGrouped || [])
      .flatMap((g) => (g.stories || []).map((s) => s._id))
      .filter(Boolean);
    const likedSet = await storiesServices.getLikedStoryIdsByViewer({
      storyIds: allGroupedStoryIds,
      viewerId: new ObjectId(userId),
    });
    const enrichedGroups = (storiesGrouped || []).map((g) => ({
      ...g,
      stories: (g.stories || []).map((s) => ({
        ...s,
        isLiked: likedSet.has(toIdStr(s._id)),
      })),
    }));

    return responseHandler({ collections: enrichedGroups }, res);
  }

  const stories = await storiesServices.find({ filter, sort: { createdAt: 1 } });

  // Stamp isLiked on each story for the current viewer
  const storyIds = (stories || []).map((s) => s._id).filter(Boolean);
  const likedSet = await storiesServices.getLikedStoryIdsByViewer({
    storyIds,
    viewerId: new ObjectId(userId),
  });
  const enrichedStories = (stories || []).map((s) => {
    const obj = s.toObject ? s.toObject() : { ...s };
    obj.isLiked = likedSet.has(toIdStr(s._id));
    return obj;
  });

  return responseHandler({ stories: enrichedStories }, res);
});

// Get a single story by ID (for opening shared stories from DMs)
exports.getStoryById = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;

  // Find the story
  const story = await storiesServices.findById({ id: storyId });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: 'Story not found',
    });
  }

  // Check if story is expired
  const now = new Date();
  const isExpired = story.expiresAt && new Date(story.expiresAt) < now;

  // Check if story is inactive (deleted)
  if (!story.isActive && !story.isHighlight) {
    return res.status(410).json({
      success: false,
      message: 'This story is no longer available',
      data: {
        isExpired: true,
        isDeleted: true,
      },
    });
  }

  // Get story owner details
  let user = null;
  if (story.userId) {
    user = await userServices.findOne({
      filter: { _id: new ObjectId(story.userId) },
      projection: {
        _id: 1,
        fullName: 1,
        userName: 1,
        profilePicture: 1,
      },
    });
  }

  // Check if current user can view the story (privacy check)
  // const _viewerObjectId = new ObjectId(userId);
  const isOwner = story.userId && toIdStr(story.userId) === toIdStr(userId);

  if (!isOwner && story.storyFrom === 'user') {
    // Check if viewer is blocked by story owner
    if (user) {
      const owner = await userServices.findOne({
        filter: { _id: new ObjectId(story.userId) },
        projection: { blockedUsers: 1, closeFriends: 1, storyHiddenFrom: 1 },
      });

      if (blockedUsersContains(owner?.blockedUsers || [], userId)) {
        return res.status(403).json({
          success: false,
          message: 'You are not allowed to view this story',
        });
      }

      // Check if hidden from this viewer
      const hiddenSet = new Set((owner?.storyHiddenFrom || []).map((id) => toIdStr(id)));
      if (hiddenSet.has(toIdStr(userId))) {
        return res.status(403).json({
          success: false,
          message: 'You are not allowed to view this story',
        });
      }

      // Check close friends audience
      if (story.audience === 'close_friends') {
        const closeFriendsSet = new Set((owner?.closeFriends || []).map((id) => toIdStr(id)));
        if (!closeFriendsSet.has(toIdStr(userId))) {
          return res.status(403).json({
            success: false,
            message: 'This story is only available to close friends',
          });
        }
      }
    }
  }

  // Check if current viewer has liked this story
  const likedSet = await storiesServices.getLikedStoryIdsByViewer({
    storyIds: [story._id],
    viewerId: new ObjectId(userId),
  });

  // Build response
  const responseData = {
    _id: story._id,
    userId: story.userId,
    hashtagId: story.hashtagId,
    storyFrom: story.storyFrom,
    storyUrl: story.storyUrl,
    mediaType: story.type,
    thumbnailUrl: story.thumbnailUrl,
    caption: story.caption,
    audience: story.audience,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewCount: story.viewCount || 0,
    replyCount: story.replyCount || 0,
    reactionCount: story.reactionCount || 0,
    likeCount: story.likeCount || 0,
    isExpired,
    isHighlight: story.isHighlight || false,
    isLiked: likedSet.has(toIdStr(story._id)),
    user,
  };

  return responseHandler({ data: responseData }, res);
});

exports.viewStory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;

  const result = await storiesServices.recordStoryView({
    storyId,
    viewerId: new ObjectId(userId),
  });

  if (!result.ok && result.reason === 'not_found') {
    return res.status(404).json({ success: false, message: 'Story not found' });
  }
  if (!result.ok && result.reason === 'forbidden') {
    return res.status(403).json({ success: false, message: 'You are not allowed to view this story' });
  }

  return responseHandler({ inserted: result.inserted, story: result.story }, res);
});

exports.getStoryViewers = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;
  const { page, limit } = req.query;

  const result = await storiesServices.listStoryViewers({
    storyId,
    ownerId: new ObjectId(userId),
    page,
    limit,
  });

  if (!result.ok && result.reason === 'not_found') {
    return res.status(404).json({ success: false, message: 'Story not found' });
  }
  if (!result.ok && result.reason === 'forbidden') {
    return res.status(403).json({ success: false, message: 'You do not have permission to view viewers for this story' });
  }

  return responseHandler({ viewers: result.viewers, pagination: result.pagination }, res);
});

exports.reactToStory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;
  const { emoji } = req.body;

  const result = await storiesServices.addStoryReaction({
    storyId,
    viewerId: new ObjectId(userId),
    emoji,
  });

  if (!result.ok && result.reason === 'not_found') {
    return res.status(404).json({ success: false, message: 'Story not found' });
  }
  if (!result.ok && result.reason === 'forbidden') {
    return res.status(403).json({ success: false, message: 'You are not allowed to react to this story' });
  }

  return responseHandler({ story: result.story }, res);
});

exports.likeStory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;

  const result = await storiesServices.toggleStoryLike({
    storyId,
    viewerId: new ObjectId(userId),
  });

  if (!result.ok && result.reason === 'not_found') {
    return res.status(404).json({ success: false, message: 'Story not found' });
  }
  if (!result.ok && result.reason === 'forbidden') {
    return res.status(403).json({ success: false, message: 'You are not allowed to like this story' });
  }

  return responseHandler({ liked: result.liked, story: result.story }, res);
});

exports.addToHighlight = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;
  const { collectionId } = req.body;

  // Check if story exists and belongs to the user
  const story = await storiesServices.findById({ id: storyId });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: 'Story not found',
    });
  }

  // Check ownership - story must have a userId and it must match the current user
  if (!story.userId) {
    return res.status(403).json({
      success: false,
      message: 'This story cannot be added to highlights',
    });
  }

  if (story.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to update this story',
    });
  }

  // Validate collectionId if provided
  if (collectionId) {
    const collection = await highlightCollectionServices.findById({ id: collectionId });

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Highlight collection not found',
      });
    }

    // Check if collection belongs to user
    if (collection.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add to this collection',
      });
    }
  }

  // Update the story to set isHighlight to true and add to collection
  const updateBody = { isHighlight: true };
  if (collectionId) {
    updateBody.highlightCollectionId = collectionId;
  }

  const updatedStory = await storiesServices.findByIdAndUpdate({
    id: storyId,
    body: updateBody,
  });

  return responseHandler({ story: updatedStory }, res);
});

exports.getHighlightedStories = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyFrom } = req.query;
  const filter = {};

  if (storyFrom === 'hashtag') {
    filter.isHighlight = true;
    filter.hashtagId = new ObjectId(req.query.hashtagId);
  } else {
    filter.isHighlight = true;
    filter.userId = req.query.userId ? new ObjectId(req.query.userId) : new ObjectId(userId);
  }

  // Get all highlighted stories (oldest first for chronological viewing)
  const stories = await storiesServices.find({ filter, sort: { createdAt: 1 } });

  // Group stories by date
  const storiesByDate = {};

  stories.forEach((story) => {
    // Extract date part only (YYYY-MM-DD) from the createdAt timestamp
    const dateKey = story.createdAt.toISOString().split('T')[0];

    // Initialize array for this date if it doesn't exist
    if (!storiesByDate[dateKey]) {
      storiesByDate[dateKey] = [];
    }

    // Add story to the appropriate date array
    storiesByDate[dateKey].push(story);
  });

  return responseHandler({ storiesByDate }, res);
});

exports.removeFromHighlight = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;

  // Check if story exists and belongs to the user
  const story = await storiesServices.findById({ id: storyId });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: 'Story not found',
    });
  }

  // Check ownership - story must have a userId and it must match the current user
  if (!story.userId) {
    return res.status(403).json({
      success: false,
      message: 'This story cannot be removed from highlights',
    });
  }

  if (story.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to update this story',
    });
  }

  // Update the story to set isHighlight to false and remove collection reference
  const updatedStory = await storiesServices.findByIdAndUpdate({
    id: storyId,
    body: {
      isHighlight: false,
      $unset: { highlightCollectionId: 1 },
    },
  });

  return responseHandler({
    message: 'Story removed from highlights successfully',
    story: updatedStory,
  }, res);
});

// Remove a story from a specific highlight collection
exports.removeStoryFromCollection = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { collectionId, storyId } = req.params;

  // Check if collection exists and belongs to user
  const collection = await highlightCollectionServices.findById({ id: collectionId });

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found',
    });
  }

  if (collection.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to modify this collection',
    });
  }

  // Check if story exists and belongs to this collection
  const story = await storiesServices.findById({ id: storyId });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: 'Story not found',
    });
  }

  if (!story.highlightCollectionId || story.highlightCollectionId.toString() !== collectionId) {
    return res.status(400).json({
      success: false,
      message: 'Story is not in this collection',
    });
  }

  // Remove the story from the collection
  const updatedStory = await storiesServices.findByIdAndUpdate({
    id: storyId,
    body: {
      $unset: { highlightCollectionId: 1 },
      isHighlight: false,
    },
  });

  return responseHandler({
    message: 'Story removed from collection successfully',
    story: updatedStory,
  }, res);
});

// Soft delete a story (mark as inactive)
exports.deleteStory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { storyId } = req.params;

  // Check if story exists
  const story = await storiesServices.findById({ id: storyId });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: 'Story not found',
    });
  }

  // Check ownership: user stories require story.userId match; hashtag stories require hashtag creator
  const isUserStory = story.storyFrom === 'user';
  const isHashtagStory = story.storyFrom === 'hashtag' && story.hashtagId;

  if (isUserStory) {
    if (!story.userId || story.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this story',
      });
    }
  } else if (isHashtagStory) {
    const hashtag = await hashtagServices.findById({ id: story.hashtagId });
    if (!hashtag || !hashtag.creatorId || hashtag.creatorId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this story',
      });
    }
  } else {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete this story',
    });
  }

  // Soft delete: mark as inactive and clear highlight/collection references
  const updatedStory = await storiesServices.findByIdAndUpdate({
    id: storyId,
    body: {
      isActive: false,
      isHighlight: false,
      $unset: {
        collectionId: 1,
        highlightCollectionId: 1,
      },
    },
  });

  return responseHandler({
    message: 'Story deleted successfully',
    story: updatedStory,
  }, res);
});

// ─────────────────────────────────────────────────────────────
// Story Mute / Notify (per-user story preferences)
// ─────────────────────────────────────────────────────────────

exports.muteUserStories = asyncHandler(async (req, res) => {
  const { userId: currentUserId } = req.user;
  const { userId: targetUserId } = req.body;
  const currentObjId = new ObjectId(currentUserId);
  const targetObjId = new ObjectId(targetUserId);

  if (toIdStr(currentObjId) === toIdStr(targetObjId)) {
    return res.status(400).json({ success: false, message: 'You cannot mute your own stories' });
  }

  // Check if already muted
  const alreadyMuted = await userServices.findOne({
    filter: { _id: currentObjId, 'storyMutedUsers.userId': targetObjId },
    projection: { _id: 1 },
  });
  if (alreadyMuted) {
    return responseHandler({ isStoryMuted: true, message: 'Stories already muted' }, res);
  }

  await userServices.findByIdAndUpdate({
    id: currentObjId,
    body: {
      $push: { storyMutedUsers: { userId: targetObjId, mutedAt: new Date() } },
    },
  });

  return responseHandler({ isStoryMuted: true, message: 'Stories muted successfully' }, res);
});

exports.unmuteUserStories = asyncHandler(async (req, res) => {
  const { userId: currentUserId } = req.user;
  const { userId: targetUserId } = req.body;
  const currentObjId = new ObjectId(currentUserId);
  const targetObjId = new ObjectId(targetUserId);

  await userServices.findByIdAndUpdate({
    id: currentObjId,
    body: {
      $pull: { storyMutedUsers: { userId: targetObjId } },
    },
  });

  return responseHandler({ isStoryMuted: false, message: 'Stories unmuted successfully' }, res);
});

exports.notifyUserStories = asyncHandler(async (req, res) => {
  const { userId: currentUserId } = req.user;
  const { userId: targetUserId } = req.body;
  const currentObjId = new ObjectId(currentUserId);
  const targetObjId = new ObjectId(targetUserId);

  if (toIdStr(currentObjId) === toIdStr(targetObjId)) {
    return res.status(400).json({ success: false, message: 'You cannot enable story notifications for yourself' });
  }

  // Check if already enabled
  const alreadyEnabled = await userServices.findOne({
    filter: { _id: currentObjId, 'storyNotifyUsers.userId': targetObjId },
    projection: { _id: 1 },
  });
  if (alreadyEnabled) {
    return responseHandler({ isNotifying: true, message: 'Story notifications already enabled' }, res);
  }

  await userServices.findByIdAndUpdate({
    id: currentObjId,
    body: {
      $push: { storyNotifyUsers: { userId: targetObjId, enabledAt: new Date() } },
    },
  });

  return responseHandler({ isNotifying: true, message: 'Story notifications enabled successfully' }, res);
});

exports.unnotifyUserStories = asyncHandler(async (req, res) => {
  const { userId: currentUserId } = req.user;
  const { userId: targetUserId } = req.body;
  const currentObjId = new ObjectId(currentUserId);
  const targetObjId = new ObjectId(targetUserId);

  await userServices.findByIdAndUpdate({
    id: currentObjId,
    body: {
      $pull: { storyNotifyUsers: { userId: targetObjId } },
    },
  });

  return responseHandler({ isNotifying: false, message: 'Story notifications disabled successfully' }, res);
});
