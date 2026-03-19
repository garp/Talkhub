const mongoose = require('mongoose');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');

const followServices = require('../services/followServices');
const userServices = require('../services/userServices');
const participantServices = require('../services/participantServices');
const chatroomServices = require('../services/chatroomServices');
const privateChatroomServices = require('../services/privateChatroomServices');

const MAX_SEED_IDS = 200;
const MAX_EDGES = 2000;
const MAX_REASON_ITEMS_PER_USER = 10;

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const uniqObjectIds = (ids) => {
  const seen = new Set();
  const out = [];
  (ids || []).forEach((id) => {
    if (!id) return;
    const key = typeof id?.toString === 'function' ? id.toString() : String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  });
  return out;
};

const pushReason = (reasonMap, userId, reason) => {
  if (!userId) return;
  const key = userId.toString();
  const existing = reasonMap.get(key) || [];

  // cap reasons per user to avoid huge payloads
  if (existing.length >= MAX_REASON_ITEMS_PER_USER) return;

  reasonMap.set(key, [...existing, reason]);
};

const scoreReason = (reason) => {
  switch (reason.type) {
    case 'YOU_FOLLOW':
      return 5;
    case 'FOLLOWS_YOU':
      return 4;
    case 'IN_PRIVATE_CHAT':
      return 3;
    case 'FOLLOWED_BY_YOUR_CONNECTION':
      return 2;
    case 'FOLLOWS_YOUR_CONNECTION':
      return 2;
    case 'IN_HASHTAG':
      return 1;
    default:
      return 0;
  }
};

exports.getPeople = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page = 1, limit = 20, search } = req.value;
  const me = new mongoose.Types.ObjectId(userId);

  const addDirectChatroomIds = async (peoplePlain) => {
    const ids = (peoplePlain || []).map((u) => u && u._id).filter(Boolean);
    if (!ids.length) return peoplePlain || [];

    const otherIdsStr = [...new Set(ids.map((id) => id.toString()))];
    const otherIds = otherIdsStr.map((id) => new mongoose.Types.ObjectId(id));

    // Find existing 1:1 private chatrooms between me and each user (no group chats).
    const rooms = await privateChatroomServices.aggregate({
      query: [
        {
          $match: {
            isGroupChat: false,
            // MongoDB does not allow $in (or other $ operators) inside $all.
            // We want: rooms that contain me AND any of the otherIds.
            $and: [{ 'participants.userId': me }, { 'participants.userId': { $in: otherIds } }],
          },
        },
        { $project: { _id: 1, participants: 1 } },
      ],
    });

    const directChatroomByUserId = (rooms || []).reduce((acc, r) => {
      const participants = (r && r.participants) || [];
      const other = participants
        .map((p) => (p && p.userId ? p.userId.toString() : null))
        .find((pid) => pid && pid !== me.toString());
      if (other) acc[other] = r._id;
      return acc;
    }, {});

    return (peoplePlain || []).map((u) => ({
      ...u,
      directChatroomId: u && u._id ? (directChatroomByUserId[u._id.toString()] || null) : null,
    }));
  };

  // SEARCH MODE:
  // If `search` is provided, return a simple user search result (no suggestion logic / reasons).
  // Searches across ALL users irrespective of relation or confidence.
  if (search && typeof search === 'string' && search.trim()) {
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Users I have blocked + users who have blocked me (exclude both from search)
    const [meUser, blockedByMeList] = await Promise.all([
      userServices.findById({ id: userId, projection: { blockedUsers: 1 } }),
      userServices.find({
        filter: { 'blockedUsers.userId': me },
        projection: { _id: 1 },
      }),
    ]);
    const blockedIds = new Set(
      ((meUser && meUser.blockedUsers) || [])
        .map((b) => (b && b.userId ? b.userId.toString() : null))
        .filter(Boolean),
    );
    const blockedMeIds = (blockedByMeList || []).map((u) => u._id.toString()).filter(Boolean);
    const excludeIds = [me.toString(), ...blockedIds, ...blockedMeIds];
    const excludeObjectIds = [...new Set(excludeIds)].map((id) => new mongoose.Types.ObjectId(id));

    const regex = new RegExp(search.trim(), 'i');

    // Build the search filter - searches ALL users matching the search term
    const searchFilter = {
      _id: { $nin: excludeObjectIds },
      active: true,
      $or: [
        { fullName: { $regex: regex } },
        { userName: { $regex: regex } },
      ],
    };

    // Get total count and users in parallel
    const [totalCount, users] = await Promise.all([
      userServices.countDocuments({ filter: searchFilter }),
      userServices.find({
        filter: searchFilter,
        projection: {
          _id: 1,
          fullName: 1,
          userName: 1,
          profilePicture: 1,
          description: 1,
          fullLocation: 1,
          location: 1,
          followers: 1,
          following: 1,
        },
        pagination: { skip, limit: limitNum },
        sort: { followers: -1, createdAt: -1 },
      }),
    ]);

    const peoplePlain = (users || []).map((u) => toPlain(u)).filter(Boolean);

    // isFollowing: whether current user follows this person
    const ids = peoplePlain.map((u) => u._id).filter(Boolean);
    const followEdges = ids.length ? await followServices.find({
      filter: {
        followerId: me,
        followingId: { $in: ids },
        status: 'accepted',
      },
      projection: { followingId: 1 },
      pagination: { limit: MAX_EDGES },
    }) : [];
    const followingSet = new Set((followEdges || []).map((e) => e.followingId && e.followingId.toString()).filter(Boolean));

    const people = peoplePlain.map((u) => ({
      ...u,
      isFollowing: !!(u && u._id && followingSet.has(u._id.toString())),
    }));
    const peopleWithChatroomId = await addDirectChatroomIds(people);

    return responseHandler(
      {
        metadata: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum) || 1,
        },
        people: peopleWithChatroomId,
      },
      res,
    );
  }

  // 1) Follow graph (direct)
  const [myFollowingEdges, myFollowerEdges, meUser] = await Promise.all([
    followServices.find({
      filter: { followerId: me, status: 'accepted' },
      projection: { followingId: 1 },
      pagination: { limit: MAX_EDGES },
    }),
    followServices.find({
      filter: { followingId: me, status: 'accepted' },
      projection: { followerId: 1 },
      pagination: { limit: MAX_EDGES },
    }),
    userServices.findById({
      id: userId,
      projection: { blockedUsers: 1 },
    }),
  ]);

  const myFollowingIds = uniqObjectIds(myFollowingEdges.map((e) => e.followingId)).slice(0, MAX_SEED_IDS);
  const myFollowerIds = uniqObjectIds(myFollowerEdges.map((e) => e.followerId)).slice(0, MAX_SEED_IDS);
  const myFollowingIdSet = new Set(myFollowingIds.map((id) => (id && id.toString ? id.toString() : String(id))));

  const blockedIds = new Set(
    ((meUser && meUser.blockedUsers) || []).map((b) => (b && b.userId ? b.userId.toString() : null)).filter(Boolean),
  );

  const reasonsByUserId = new Map();

  myFollowingIds.forEach((id) => pushReason(reasonsByUserId, id, { type: 'YOU_FOLLOW' }));
  myFollowerIds.forEach((id) => pushReason(reasonsByUserId, id, { type: 'FOLLOWS_YOU' }));

  // 2) Second-degree connections around my followers/following
  const [fofEdges, followersOfMyFollowersEdges] = await Promise.all([
    // People followed by my connections (e.g., B follows D)
    followServices.find({
      filter: { followerId: { $in: [...myFollowingIds, ...myFollowerIds] }, status: 'accepted' },
      projection: { followerId: 1, followingId: 1 },
      pagination: { limit: MAX_EDGES },
    }),
    // People who follow my connections (e.g., E follows C where C follows you)
    followServices.find({
      filter: { followingId: { $in: [...myFollowingIds, ...myFollowerIds] }, status: 'accepted' },
      projection: { followerId: 1, followingId: 1 },
      pagination: { limit: MAX_EDGES },
    }),
  ]);

  fofEdges.forEach((edge) => {
    if (!edge || !edge.followingId || !edge.followerId) return;
    if (edge.followingId.toString() === me.toString()) return;
    pushReason(reasonsByUserId, edge.followingId, {
      type: 'FOLLOWED_BY_YOUR_CONNECTION',
      connectionUserId: edge.followerId,
    });
  });

  followersOfMyFollowersEdges.forEach((edge) => {
    if (!edge || !edge.followingId || !edge.followerId) return;
    if (edge.followerId.toString() === me.toString()) return;
    pushReason(reasonsByUserId, edge.followerId, {
      type: 'FOLLOWS_YOUR_CONNECTION',
      connectionUserId: edge.followingId,
    });
  });

  // 3) Same hashtag chatrooms (participants + chatrooms)
  const myParticipants = await participantServices.find({
    filter: { userId: me },
    projection: { chatroomId: 1 },
    pagination: { limit: MAX_EDGES },
  });
  const myChatroomIds = uniqObjectIds(myParticipants.map((p) => p.chatroomId));

  const chatroomMap = {};
  if (myChatroomIds.length) {
    const [chatrooms, otherParticipants] = await Promise.all([
      chatroomServices.find({
        filter: { _id: { $in: myChatroomIds } },
        projection: { _id: 1, name: 1, hashtagId: 1 },
        pagination: { limit: MAX_EDGES },
      }),
      participantServices.find({
        filter: { chatroomId: { $in: myChatroomIds }, userId: { $ne: me } },
        projection: { userId: 1, chatroomId: 1 },
        pagination: { limit: MAX_EDGES },
      }),
    ]);

    chatrooms.forEach((c) => {
      chatroomMap[c._id.toString()] = { chatroomId: c._id, name: c.name, hashtagId: c.hashtagId };
    });

    otherParticipants.forEach((p) => {
      if (!p || !p.chatroomId || !p.userId) return;
      const cr = chatroomMap[p.chatroomId.toString()];
      if (!cr) return;
      pushReason(reasonsByUserId, p.userId, {
        type: 'IN_HASHTAG',
        hashtagName: cr.name,
        hashtagId: cr.hashtagId || null,
        chatroomId: cr.chatroomId,
      });
    });
  }

  // 4) Same private chatrooms
  const myPrivateChatrooms = await privateChatroomServices.find({
    filter: { 'participants.userId': me },
    projection: {
      _id: 1,
      name: 1,
      isGroupChat: 1,
      participants: 1,
    },
    pagination: { limit: MAX_EDGES },
  });

  myPrivateChatrooms.forEach((room) => {
    if (!room || !Array.isArray(room.participants)) return;
    room.participants.forEach((p) => {
      if (!p || !p.userId) return;
      if (p.userId.toString() === me.toString()) return;
      pushReason(reasonsByUserId, p.userId, {
        type: 'IN_PRIVATE_CHAT',
        chatroomId: room._id,
        chatroomName: room.name || null,
        isGroupChat: !!room.isGroupChat,
      });
    });
  });

  // Candidate user ids
  const candidateIds = [...reasonsByUserId.keys()]
    .filter((id) => id !== me.toString() && !blockedIds.has(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!candidateIds.length) {
    return responseHandler(
      {
        metadata: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 0,
        },
        people: [],
      },
      res,
    );
  }

  const userSearchFilter = {};
  if (search && typeof search === 'string' && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    userSearchFilter.$or = [
      { fullName: { $regex: regex } },
      { userName: { $regex: regex } },
    ];
  }

  const users = await userServices.find({
    filter: {
      _id: { $in: candidateIds },
      active: true,
      // exclude users who blocked me (same logic used elsewhere)
      'blockedUsers.userId': { $ne: me },
      ...userSearchFilter,
    },
    projection: {
      _id: 1,
      fullName: 1,
      userName: 1,
      profilePicture: 1,
      description: 1,
      fullLocation: 1,
      location: 1,
      followers: 1,
      following: 1,
    },
  });

  const userById = users.reduce((acc, u) => {
    const plain = toPlain(u);
    if (!plain || !plain._id) return acc;
    acc[plain._id.toString()] = plain;
    return acc;
  }, {});

  // Optional: enrich reasons with connection userName when we have it in this payload
  const allConnectionIds = uniqObjectIds(
    [...reasonsByUserId.values()]
      .flat()
      .map((r) => r.connectionUserId)
      .filter(Boolean),
  );
  const connectionUsers = allConnectionIds.length
    ? await userServices.find({
      filter: { _id: { $in: allConnectionIds } },
      projection: { _id: 1, userName: 1, fullName: 1 },
      pagination: { limit: MAX_EDGES },
    })
    : [];
  const connectionById = connectionUsers.reduce((acc, u) => {
    const plain = toPlain(u);
    if (!plain || !plain._id) return acc;
    acc[plain._id.toString()] = plain;
    return acc;
  }, {});

  const peopleWithReasons = Object.keys(userById).map((id) => {
    const reasons = (reasonsByUserId.get(id) || []).map((r) => {
      if (r.connectionUserId) {
        const cu = connectionById[r.connectionUserId.toString()];
        return {
          ...r,
          connectionUser: cu
            ? { _id: cu._id, userName: cu.userName, fullName: cu.fullName }
            : { _id: r.connectionUserId },
        };
      }
      return r;
    });
    const relevanceScore = reasons.reduce((sum, r) => sum + scoreReason(r), 0);
    return {
      ...userById[id],
      isFollowing: myFollowingIdSet.has(id),
      reasons,
      relevanceScore,
    };
  });

  peopleWithReasons.sort((a, b) => (
    (b.relevanceScore - a.relevanceScore)
    || ((b.followers || 0) - (a.followers || 0))
    || String(a._id || '').localeCompare(String(b._id || ''))
  ));

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum;
  const paged = peopleWithReasons.slice(start, end);
  const pagedWithChatroomId = await addDirectChatroomIds(paged);

  return responseHandler(
    {
      metadata: {
        page: pageNum,
        limit: limitNum,
        total: peopleWithReasons.length,
        totalPages: Math.ceil(peopleWithReasons.length / limitNum) || 1,
      },
      people: pagedWithChatroomId,
    },
    res,
  );
});
