const model = require('../models/stories.model');
const collectionModel = require('../models/storyCollections.model');
const dal = require('../../lib/dal/dal');
const storyViewModel = require('../models/storyView.model');
const storyReelSeenModel = require('../models/storyReelSeen.model');
const userServices = require('./userServices');
const followServices = require('./followServices');

const STORY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const toObjectIdString = (id) => (id ? String(id) : '');

const arrayIncludesObjectId = (arr, id) => {
  const idStr = toObjectIdString(id);
  if (!arr || !arr.length || !idStr) return false;
  return arr.some((x) => toObjectIdString(x) === idStr);
};

const blockedUsersContains = (blockedUsers, otherUserId) => {
  const otherIdStr = toObjectIdString(otherUserId);
  if (!otherIdStr) return false;
  return (blockedUsers || []).some((b) => toObjectIdString(b?.userId || b) === otherIdStr);
};

/**
 * For a list of story IDs, return a Map<storyIdStr, viewList[]> where each
 * viewList entry has viewer profile info and isLiked.
 * Intended for the story owner to see who viewed + liked their stories.
 */
exports.getStoryViewListsByStoryIds = async ({ storyIds, session = null }) => {
  if (!storyIds || !storyIds.length) return new Map();

  const rows = await storyViewModel.aggregate([
    { $match: { storyId: { $in: storyIds } } },
    { $sort: { viewedAt: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'viewerId',
        foreignField: '_id',
        as: 'viewer',
        pipeline: [{
          $project: {
            _id: 1, fullName: 1, userName: 1, profilePicture: 1,
          },
        }],
      },
    },
    { $unwind: { path: '$viewer', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        storyId: 1,
        viewerId: 1,
        viewedAt: 1,
        isLiked: { $ifNull: ['$liked', false] },
        viewer: 1,
      },
    },
  ]).session(session);

  const map = new Map();
  (rows || []).forEach((row) => {
    const key = toObjectIdString(row.storyId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      _id: row.viewerId,
      fullName: row.viewer?.fullName || null,
      userName: row.viewer?.userName || null,
      profilePicture: row.viewer?.profilePicture || null,
      isLiked: row.isLiked,
      viewedAt: row.viewedAt,
    });
  });
  return map;
};

/**
 * Given an array of story IDs and a viewer, return a Set of story IDs that
 * the viewer has liked. Useful for stamping `isLiked` on story lists.
 */
exports.getLikedStoryIdsByViewer = async ({ storyIds, viewerId, session = null }) => {
  if (!storyIds || !storyIds.length || !viewerId) return new Set();
  const docs = await storyViewModel.find(
    { storyId: { $in: storyIds }, viewerId, liked: true },
    { storyId: 1 },
  ).session(session).lean();
  return new Set((docs || []).map((d) => toObjectIdString(d.storyId)));
};

exports.create = async (storyData, session = null) => {
  const body = { ...(storyData || {}) };

  // Ensure expiresAt for user stories (for hashtag stories, keep null unless explicitly set)
  if (body.storyFrom === 'user' && !body.expiresAt) {
    body.expiresAt = new Date(Date.now() + STORY_LIFETIME_MS);
  }

  return dal.create(model, { body, session });
};

exports.find = async ({
  filter = {}, pagination = {}, sort = {}, projection = {}, populate = null, session = null,
}) => dal.find(model, {
  filter, pagination, sort, projection, populate, session,
});

exports.findGroupedByCollection = async ({
  filter = {}, sort = { createdAt: -1 }, session = null,
}) => {
  try {
    const pipeline = [
      // Match the filter criteria
      { $match: filter },

      // Sort stories
      { $sort: sort },

      // Lookup collection details
      {
        $lookup: {
          from: 'storycollections', // Make sure this matches your collection name
          localField: 'collectionId',
          foreignField: '_id',
          as: 'collection',
        },
      },

      // Unwind collection array
      {
        $unwind: {
          path: '$collection',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Group by collectionId
      {
        $group: {
          _id: '$collectionId',
          collectionName: { $first: '$collection.name' },
          stories: {
            $push: {
              _id: '$_id',
              storyUrl: '$storyUrl',
              thumbnailUrl: '$thumbnailUrl',
              type: '$type',
              isActive: '$isActive',
              isHighlight: '$isHighlight',
              storyFrom: '$storyFrom',
              hashtagId: '$hashtagId',
              userId: '$userId',
              createdAt: '$createdAt',
              updatedAt: '$updatedAt',
            },
          },
        },
      },

      // Sort collections by the first story's creation date
      { $sort: { 'stories.0.createdAt': -1 } },
    ];

    const result = await model.aggregate(pipeline).session(session);
    return result;
  } catch (error) {
    console.error('Error in findGroupedByCollection:', error);
    throw error;
  }
};

exports.findById = async ({ id, session = null }) => dal.findById(model, { id, session });

exports.findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, { id, body, session });

exports.findOneAndUpdate = async ({ filter, body, session = null }) => dal.findOneAndUpdate(model, { filter, body, session });

exports.hashtagStories = async ({ hashtagId, stories, session = null }) => {
  try {
    stories.forEach(async (story) => {
      const collection = await collectionModel.create({ name: story.name });

      const storiesData = [];
      story.story.forEach(async (s) => {
        storiesData.push({
          storyUrl: s.url,
          type: s.type,
          storyFrom: 'hashtag',
          hashtagId,
          collectionId: collection._id,
        });
      });
      return dal.createMany(model, { body: storiesData, session });
    });
  } catch (error) {
    console.log(error);
  }
};

exports.deleteMany = async ({ filter, session = null }) => dal.deleteMany(model, {
  filter, session,
});

/**
 * Determine if viewer can see a story (Instagram-like rules).
 * NOTE: this checks audience + hide-from + block + private-account follow status.
 */
exports.canViewerSeeStory = async ({
  story,
  viewerId,
  viewerUser = null,
  ownerUser = null,
  session = null,
}) => {
  if (!story) return false;
  const storyOwnerId = story.userId;
  if (!storyOwnerId || !viewerId) return false;

  // Owner can always view.
  if (toObjectIdString(storyOwnerId) === toObjectIdString(viewerId)) return true;

  // If story is inactive or expired, it shouldn't be viewable in "stories" context
  const now = new Date();
  const expiresAt = story.expiresAt || null;
  if (story.isActive === false) return false;
  if (expiresAt && expiresAt <= now) return false;
  if (!expiresAt) {
    // Backward compatibility: fallback to 7-day window if expiresAt missing
    const storyLifetimeAgo = new Date(Date.now() - STORY_LIFETIME_MS);
    if (story.createdAt && story.createdAt < storyLifetimeAgo) return false;
  }

  const owner = ownerUser || await userServices.findById({ id: storyOwnerId, session });
  if (!owner) return false;
  const viewer = viewerUser || await userServices.findById({ id: viewerId, session });
  if (!viewer) return false;

  // Block rules (either direction)
  if (blockedUsersContains(owner.blockedUsers || [], viewerId)) return false;
  if (blockedUsersContains(viewer.blockedUsers || [], storyOwnerId)) return false;

  // Hide-from rules
  if (arrayIncludesObjectId(owner.storyHiddenFrom || [], viewerId)) return false;

  // Private account rules (must be accepted follower)
  if (owner.isPrivateAccount) {
    const follow = await followServices.findOne({
      filter: {
        followerId: viewerId,
        followingId: storyOwnerId,
        status: 'accepted',
      },
      projection: { _id: 1 },
      session,
    });
    if (!follow) return false;
  }

  // Audience rules
  if (story.audience === 'close_friends') {
    if (!arrayIncludesObjectId(owner.closeFriends || [], viewerId)) return false;
  }

  return true;
};

exports.recordStoryView = async ({
  storyId,
  viewerId,
  session = null,
}) => {
  const story = await exports.findById({ id: storyId, session });
  if (!story) return { ok: false, reason: 'not_found' };

  const canSee = await exports.canViewerSeeStory({ story, viewerId, session });
  if (!canSee) return { ok: false, reason: 'forbidden' };

  const ownerId = story.userId;
  const viewedAt = new Date();

  let inserted = false;
  try {
    await storyViewModel.create([{
      storyId,
      ownerId,
      viewerId,
      viewedAt,
    }], { session });
    inserted = true;
  } catch (e) {
    // Duplicate key means this viewer has already viewed this story
    if (!(e && (e.code === 11000 || e.code === 11001))) throw e;
  }

  if (inserted) {
    await exports.findByIdAndUpdate({
      id: storyId,
      body: { $inc: { viewCount: 1 } },
      session,
    });
  }

  // Update reel-level seen timestamp
  await storyReelSeenModel.findOneAndUpdate(
    { ownerId, viewerId },
    { $set: { lastSeenAt: viewedAt } },
    { upsert: true, new: true, session },
  );

  const updatedStory = await exports.findById({ id: storyId, session });
  return { ok: true, inserted, story: updatedStory };
};

exports.addStoryReaction = async ({
  storyId,
  viewerId,
  emoji,
  session = null,
}) => {
  const story = await exports.findById({ id: storyId, session });
  if (!story) return { ok: false, reason: 'not_found' };

  const canSee = await exports.canViewerSeeStory({ story, viewerId, session });
  if (!canSee) return { ok: false, reason: 'forbidden' };

  const ownerId = story.userId;
  const now = new Date();

  const existing = await storyViewModel.findOne({ storyId, viewerId }).session(session);
  if (!existing) {
    // Create a view doc (counts as view) + reaction
    try {
      await storyViewModel.create([{
        storyId,
        ownerId,
        viewerId,
        viewedAt: now,
        reaction: emoji || null,
      }], { session });
      await exports.findByIdAndUpdate({
        id: storyId,
        body: { $inc: { viewCount: 1, reactionCount: emoji ? 1 : 0 } },
        session,
      });
    } catch (e) {
      if (!(e && (e.code === 11000 || e.code === 11001))) throw e;
      // Race: it was created; fall through to update below
    }
  } else {
    const hadReaction = !!existing.reaction;
    const willHaveReaction = !!emoji;
    existing.reaction = emoji || null;
    existing.viewedAt = existing.viewedAt || now;
    await existing.save({ session });

    if (!hadReaction && willHaveReaction) {
      await exports.findByIdAndUpdate({
        id: storyId,
        body: { $inc: { reactionCount: 1 } },
        session,
      });
    }
  }

  // Update reel-level seen timestamp
  await storyReelSeenModel.findOneAndUpdate(
    { ownerId, viewerId },
    { $set: { lastSeenAt: now } },
    { upsert: true, new: true, session },
  );

  const updatedStory = await exports.findById({ id: storyId, session });
  return { ok: true, story: updatedStory };
};

/**
 * Toggle like on a story (like / unlike).
 * Creates a storyView record if one does not exist yet (counts as a view too).
 */
exports.toggleStoryLike = async ({
  storyId,
  viewerId,
  session = null,
}) => {
  const story = await exports.findById({ id: storyId, session });
  if (!story) return { ok: false, reason: 'not_found' };

  const canSee = await exports.canViewerSeeStory({ story, viewerId, session });
  if (!canSee) return { ok: false, reason: 'forbidden' };

  const ownerId = story.userId;
  const now = new Date();

  const existing = await storyViewModel.findOne({ storyId, viewerId }).session(session);

  let liked;
  if (!existing) {
    // No view record yet — create one with liked = true (also counts as a view)
    try {
      await storyViewModel.create([{
        storyId,
        ownerId,
        viewerId,
        viewedAt: now,
        liked: true,
      }], { session });
      liked = true;
      await exports.findByIdAndUpdate({
        id: storyId,
        body: { $inc: { viewCount: 1, likeCount: 1 } },
        session,
      });
    } catch (e) {
      if (!(e && (e.code === 11000 || e.code === 11001))) throw e;
      // Race condition: record was created between our check and insert – fall through
      const raced = await storyViewModel.findOne({ storyId, viewerId }).session(session);
      liked = !raced.liked;
      raced.liked = liked;
      await raced.save({ session });
      await exports.findByIdAndUpdate({
        id: storyId,
        body: { $inc: { likeCount: liked ? 1 : -1 } },
        session,
      });
    }
  } else {
    // Toggle the liked flag
    liked = !existing.liked;
    existing.liked = liked;
    await existing.save({ session });
    await exports.findByIdAndUpdate({
      id: storyId,
      body: { $inc: { likeCount: liked ? 1 : -1 } },
      session,
    });
  }

  // Update reel-level seen timestamp
  await storyReelSeenModel.findOneAndUpdate(
    { ownerId, viewerId },
    { $set: { lastSeenAt: now } },
    { upsert: true, new: true, session },
  );

  const updatedStory = await exports.findById({ id: storyId, session });
  return { ok: true, liked, story: updatedStory };
};

exports.listStoryViewers = async ({
  storyId,
  ownerId,
  page = 1,
  limit = 20,
  session = null,
}) => {
  const story = await exports.findById({ id: storyId, session });
  if (!story) return { ok: false, reason: 'not_found' };
  if (toObjectIdString(story.userId) !== toObjectIdString(ownerId)) return { ok: false, reason: 'forbidden' };

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [rows, totalCount] = await Promise.all([
    storyViewModel.aggregate([
      { $match: { storyId: story._id } },
      { $sort: { viewedAt: -1 } },
      { $skip: skip },
      { $limit: safeLimit },
      {
        $lookup: {
          from: 'users',
          localField: 'viewerId',
          foreignField: '_id',
          as: 'viewer',
          pipeline: [{
            $project: {
              _id: 1, fullName: 1, userName: 1, profilePicture: 1,
            },
          }],
        },
      },
      { $unwind: { path: '$viewer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          viewerId: 1,
          viewedAt: 1,
          reaction: 1,
          isLiked: { $ifNull: ['$liked', false] },
          viewer: 1,
        },
      },
    ]).session(session),
    storyViewModel.countDocuments({ storyId: story._id }).session(session),
  ]);

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    ok: true,
    viewers: rows || [],
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
};

exports.getStoriesFeedForViewer = async ({
  viewerId,
  followingIds = [],
  session = null,
}) => {
  const viewerObjectId = viewerId;
  const viewer = await userServices.findById({
    id: viewerObjectId,
    session,
  });
  if (!viewer) return [];

  const now = new Date();
  const storyLifetimeAgo = new Date(Date.now() - STORY_LIFETIME_MS);

  const candidateOwnerIds = [viewerObjectId, ...(followingIds || [])];

  // Fetch stories grouped by owner. We'll apply audience filtering in JS (needs owner settings).
  const pipeline = [
    {
      $match: {
        storyFrom: 'user',
        userId: { $in: candidateOwnerIds },
        isActive: true,
        $or: [
          { expiresAt: { $gt: now } },
          { expiresAt: null, createdAt: { $gte: storyLifetimeAgo } },
          { expiresAt: { $exists: false }, createdAt: { $gte: storyLifetimeAgo } },
        ],
      },
    },
    // Sort ascending so stories within each reel are oldest-first (chronological playback)
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$userId',
        stories: {
          $push: {
            _id: '$_id',
            storyUrl: '$storyUrl',
            thumbnailUrl: '$thumbnailUrl',
            type: '$type',
            isHighlight: '$isHighlight',
            audience: '$audience',
            caption: '$caption',
            mentionUserIds: '$mentionUserIds',
            linkSticker: '$linkSticker',
            interactive: '$interactive',
            viewCount: '$viewCount',
            reactionCount: '$reactionCount',
            replyCount: '$replyCount',
            likeCount: '$likeCount',
            expiresAt: '$expiresAt',
            createdAt: '$createdAt',
            updatedAt: '$updatedAt',
          },
        },
        // $last because we sorted ascending — last doc in group is the newest
        latestStoryAt: { $last: '$createdAt' },
        storyCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [
          {
            $project: {
              _id: 1,
              fullName: 1,
              userName: 1,
              profilePicture: 1,
              closeFriends: 1,
              storyHiddenFrom: 1,
              blockedUsers: 1,
              isPrivateAccount: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $addFields: {
        isOwnStory: { $eq: ['$_id', viewerObjectId] },
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        user: 1,
        stories: 1,
        storyCount: 1,
        latestStoryAt: 1,
        isOwnStory: 1,
      },
    },
  ];

  const reels = await model.aggregate(pipeline).session(session);

  // Apply privacy/audience filtering and drop empty reels
  const filtered = await Promise.all((reels || []).map(async (r) => {
    const isOwn = !!r.isOwnStory;
    if (!r || !r.user || !r.userId) return null;

    if (!isOwn) {
      // Block rules
      if (blockedUsersContains(r.user.blockedUsers || [], viewerObjectId)) return null;
      if (blockedUsersContains(viewer.blockedUsers || [], r.userId)) return null;

      // Hide-from
      if (arrayIncludesObjectId(r.user.storyHiddenFrom || [], viewerObjectId)) return null;

      // Private account: require accepted follow
      if (r.user.isPrivateAccount) {
        const follow = await followServices.findOne({
          filter: { followerId: viewerObjectId, followingId: r.userId, status: 'accepted' },
          projection: { _id: 1 },
          session,
        });
        if (!follow) return null;
      }
    }

    const visibleStories = (r.stories || []).filter((s) => {
      if (isOwn) return true;
      if (!s) return false;
      if (s.audience === 'close_friends') {
        return arrayIncludesObjectId(r.user.closeFriends || [], viewerObjectId);
      }
      return true;
    });

    if (!visibleStories.length) return null;

    // Stories are oldest-first; latest is the last element
    const latestStoryAt = visibleStories[visibleStories.length - 1].createdAt;
    return {
      ...r,
      stories: visibleStories,
      storyCount: visibleStories.length,
      latestStoryAt,
    };
  }));
  const filteredReels = filtered.filter(Boolean);

  // Strip sensitive / internal fields from user objects before returning
  const sanitizedReels = filteredReels.map((r) => {
    if (!r.user) return r;
    const {
      blockedUsers, closeFriends, storyHiddenFrom, isPrivateAccount, ...safeUser
    } = r.user;
    return { ...r, user: safeUser };
  });

  // Reel seen state for unseen-first sorting
  const ownerIds = sanitizedReels.filter((r) => !r.isOwnStory).map((r) => r.userId);
  const seenDocs = ownerIds.length
    ? await storyReelSeenModel.find({ viewerId: viewerObjectId, ownerId: { $in: ownerIds } }, { ownerId: 1, lastSeenAt: 1 })
      .session(session)
    : [];
  const seenMap = new Map((seenDocs || []).map((d) => [toObjectIdString(d.ownerId), d.lastSeenAt || null]));

  const withSeen = sanitizedReels.map((r) => {
    if (r.isOwnStory) return { ...r, hasSeen: true, lastSeenAt: null };
    const lastSeenAt = seenMap.get(toObjectIdString(r.userId)) || null;
    const hasSeen = lastSeenAt && (!r.latestStoryAt || new Date(r.latestStoryAt) <= new Date(lastSeenAt));
    return { ...r, hasSeen: !!hasSeen, lastSeenAt };
  });

  // Sort: own first; then unseen (hasSeen=false) first; then recency
  withSeen.sort((a, b) => {
    if (a.isOwnStory && !b.isOwnStory) return -1;
    if (!a.isOwnStory && b.isOwnStory) return 1;
    if (!a.isOwnStory && !b.isOwnStory) {
      if ((a.hasSeen ? 1 : 0) !== (b.hasSeen ? 1 : 0)) return (a.hasSeen ? 1 : 0) - (b.hasSeen ? 1 : 0);
    }
    const at = a.latestStoryAt ? new Date(a.latestStoryAt).getTime() : 0;
    const bt = b.latestStoryAt ? new Date(b.latestStoryAt).getTime() : 0;
    return bt - at;
  });

  return withSeen;
};

/**
 * Get stories feed for a user (their own + followed users' stories)
 * Similar to Instagram stories - grouped by user, sorted by recency
 * Only returns stories from the last 7 days
 */
exports.getStoriesFeed = async ({ userId, followingIds, session = null }) => {
  try {
    return await exports.getStoriesFeedForViewer({
      viewerId: userId,
      followingIds,
      session,
    });
  } catch (error) {
    console.error('Error in getStoriesFeed:', error);
    throw error;
  }
};

exports.expireStories = async ({ now = new Date(), session = null } = {}) => {
  const storyLifetimeAgo = new Date(Date.now() - STORY_LIFETIME_MS);
  const filter = {
    storyFrom: 'user',
    isActive: true,
    $or: [
      { expiresAt: { $lte: now } },
      { expiresAt: null, createdAt: { $lt: storyLifetimeAgo } },
      { expiresAt: { $exists: false }, createdAt: { $lt: storyLifetimeAgo } },
    ],
  };

  const update = {
    $set: {
      isActive: false,
      isArchived: true,
    },
  };

  // Intentionally use the mongoose model directly for bulk expiry.
  const result = await model.updateMany(filter, update).session(session);
  return result;
};
