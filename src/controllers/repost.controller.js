const mongoose = require('mongoose');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const repostServices = require('../services/repostServices');
const postServices = require('../services/postServices');
const userServices = require('../services/userServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { emitNewRepost } = require('../events/feedEvents');

/**
 * Create a repost
 * POST /repost/add-repost
 * Reposts an existing post with optional text
 */
exports.addRepost = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { postId, text } = req.value;

  try {
    // Validate postId format
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        code: 'ERR-INVALID-POST-ID',
        message: 'Invalid post ID format',
      });
    }

    const postObjectId = new mongoose.Types.ObjectId(postId);

    // Check if post exists
    const post = await postServices.findOne({
      filter: { _id: postObjectId },
    });

    if (!post) {
      return res.status(404).json({
        code: 'ERR-POST-NOT-FOUND',
        message: 'Post not found',
      });
    }

    // Check if already reposted by this user
    const existingRepost = await repostServices.findOne({
      filter: { repostedBy: userId, postId: postObjectId },
    });

    if (existingRepost) {
      return res.status(409).json({
        code: 'ERR-REPOST-EXISTS',
        message: 'You have already reposted this post',
      });
    }

    // Create the repost
    const repost = await repostServices.create({
      body: {
        repostedBy: userId,
        postId: postObjectId,
        text: text || null,
      },
    });

    // Get user info for socket emission
    const user = await userServices.findOne({
      filter: { _id: userId },
    });

    // Emit socket event for new repost
    if (user) {
      emitNewRepost({
        creatorUserId: userId,
        repost,
        originalPost: post,
        creator: {
          _id: user._id,
          userName: user.userName,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
        },
      });
    }

    // Send notification to the original post owner (only if it's not the same user)
    const postOwnerId = post.userId.toString();
    if (postOwnerId !== userId) {
      const postOwner = await userServices.findById({ id: postOwnerId });
      if (postOwner) {
        const repostUserName = user?.fullName || user?.userName || 'Someone';
        const summary = `${repostUserName} reposted your post`;
        const firstMedia = post.media && post.media[0];
        const imageLink = firstMedia && firstMedia.url ? firstMedia.url : null;
        const thumbnailUrl = (firstMedia && (firstMedia.thumbnailUrl || firstMedia.url)) || null;

        // Create in-app notification
        await notificationService.create({
          body: {
            userId: postOwnerId,
            senderId: userId,
            category: 'updates',
            type: 'update',
            summary,
            meta: {
              repostId: repost._id,
              postId: post._id,
              repostedBy: userId,
              imageLink,
              thumbnailUrl,
            },
          },
        });

        // Send push notification
        if (postOwner.fcmToken) {
          await pushNotificationService.sendPrivateMessageNotification({
            fcmToken: postOwner.fcmToken,
            title: 'Your post was reposted',
            body: summary,
            type: 'repost',
            data: {
              postId: String(post._id),
              repostId: String(repost._id),
              userId: String(userId),
            },
          });
        }
      }
    }

    return responseHandler({
      message: 'Post reposted successfully',
      repost: {
        _id: repost._id,
        repostedBy: repost.repostedBy,
        postId: repost.postId,
        text: repost.text,
        createdAt: repost.createdAt,
      },
    }, res, 201);
  } catch (error) {
    console.error('Error creating repost:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Remove a repost
 * DELETE /repost/remove-repost
 * Removes a repost by its ID (ownership check)
 */
exports.removeRepost = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { repostId } = req.value;

  try {
    // Validate repostId format
    if (!mongoose.Types.ObjectId.isValid(repostId)) {
      return res.status(400).json({
        code: 'ERR-INVALID-REPOST-ID',
        message: 'Invalid repost ID format',
      });
    }

    const repostObjectId = new mongoose.Types.ObjectId(repostId);

    // Find and delete repost (with ownership check)
    const deletedRepost = await repostServices.findOneAndDelete({
      filter: { _id: repostObjectId, repostedBy: userId },
    });

    if (!deletedRepost) {
      return res.status(404).json({
        code: 'ERR-REPOST-NOT-FOUND',
        message: 'Repost not found or you do not have permission to delete it',
      });
    }

    return responseHandler({
      message: 'Repost removed successfully',
      repostId,
    }, res);
  } catch (error) {
    console.error('Error removing repost:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get a single repost by ID
 * GET /repost/:repostId
 * Returns repost with populated post and user details
 */
exports.getRepost = asyncHandler(async (req, res) => {
  const { repostId } = req.params;
  const { userId } = req.user;

  try {
    // Validate repostId format
    if (!mongoose.Types.ObjectId.isValid(repostId)) {
      return res.status(400).json({
        code: 'ERR-INVALID-REPOST-ID',
        message: 'Invalid repost ID format',
      });
    }

    const repostObjectId = new mongoose.Types.ObjectId(repostId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Aggregate to get repost with full details
    const result = await repostServices.aggregate({
      query: [
        {
          $match: { _id: repostObjectId },
        },
        // Lookup repostedBy user details
        {
          $lookup: {
            from: 'users',
            localField: 'repostedBy',
            foreignField: '_id',
            as: 'repostedByDetails',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  userName: 1,
                  profilePicture: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$repostedByDetails',
            preserveNullAndEmptyArrays: false,
          },
        },
        // Lookup original post
        {
          $lookup: {
            from: 'posts',
            localField: 'postId',
            foreignField: '_id',
            as: 'originalPost',
            pipeline: [
              // Lookup post author
              {
                $lookup: {
                  from: 'users',
                  localField: 'userId',
                  foreignField: '_id',
                  as: 'userDetails',
                  pipeline: [
                    {
                      $project: {
                        _id: 1,
                        fullName: 1,
                        userName: 1,
                        profilePicture: 1,
                        location: 1,
                        email: 1,
                        description: 1,
                        bannerPicture: 1,
                      },
                    },
                  ],
                },
              },
              {
                $unwind: {
                  path: '$userDetails',
                  preserveNullAndEmptyArrays: false,
                },
              },
              // Lookup likes
              {
                $lookup: {
                  from: 'likes',
                  localField: '_id',
                  foreignField: 'postId',
                  as: 'likes',
                },
              },
              {
                $addFields: {
                  isLiked: {
                    $in: [userObjectId, '$likes.userId'],
                  },
                  likeCount: { $size: '$likes' },
                },
              },
              // Lookup saves
              {
                $lookup: {
                  from: 'saves',
                  localField: '_id',
                  foreignField: 'postId',
                  as: 'saveDetails',
                },
              },
              // Lookup reposts for this post
              {
                $lookup: {
                  from: 'reposts',
                  localField: '_id',
                  foreignField: 'postId',
                  as: 'reposts',
                },
              },
              {
                $addFields: {
                  isSaved: {
                    $in: [userObjectId, '$saveDetails.userId'],
                  },
                  repostCount: { $size: '$reposts' },
                  isReposted: {
                    $in: [userObjectId, '$reposts.repostedBy'],
                  },
                },
              },
              // Project fields
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  text: 1,
                  media: 1,
                  location: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  viewCount: 1,
                  userDetails: 1,
                  isLiked: 1,
                  isSaved: 1,
                  likeCount: 1,
                  repostCount: 1,
                  isReposted: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$originalPost',
            preserveNullAndEmptyArrays: false,
          },
        },
        // Final projection
        {
          $project: {
            _id: 1,
            text: 1,
            createdAt: 1,
            updatedAt: 1,
            repostedBy: '$repostedByDetails',
            originalPost: 1,
          },
        },
      ],
    });

    if (!result || result.length === 0) {
      return res.status(404).json({
        code: 'ERR-REPOST-NOT-FOUND',
        message: 'Repost not found',
      });
    }

    return responseHandler({
      repost: result[0],
    }, res);
  } catch (error) {
    console.error('Error fetching repost:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get all reposts by a user
 * GET /repost
 * Query params: userId, pageNo, pageLimit
 */
exports.getReposts = asyncHandler(async (req, res) => {
  const { userId: targetUserId, pageNo, pageLimit } = req.value;
  const { userId: currentUserId } = req.user;

  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        code: 'ERR-INVALID-USER-ID',
        message: 'Invalid user ID format',
      });
    }

    const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);
    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

    const page = Number(pageNo);
    const limit = Number(pageLimit);
    const skip = (page - 1) * limit;

    // Aggregate to get reposts with full details
    const result = await repostServices.aggregate({
      query: [
        {
          $match: { repostedBy: targetUserObjectId },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $facet: {
            reposts: [
              { $skip: skip },
              { $limit: limit },
              // Lookup repostedBy user details
              {
                $lookup: {
                  from: 'users',
                  localField: 'repostedBy',
                  foreignField: '_id',
                  as: 'repostedByDetails',
                  pipeline: [
                    {
                      $project: {
                        _id: 1,
                        fullName: 1,
                        userName: 1,
                        profilePicture: 1,
                      },
                    },
                  ],
                },
              },
              {
                $unwind: {
                  path: '$repostedByDetails',
                  preserveNullAndEmptyArrays: false,
                },
              },
              // Lookup original post
              {
                $lookup: {
                  from: 'posts',
                  localField: 'postId',
                  foreignField: '_id',
                  as: 'originalPost',
                  pipeline: [
                    // Lookup post author
                    {
                      $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'userDetails',
                        pipeline: [
                          {
                            $project: {
                              _id: 1,
                              fullName: 1,
                              userName: 1,
                              profilePicture: 1,
                              location: 1,
                              email: 1,
                              description: 1,
                              bannerPicture: 1,
                            },
                          },
                        ],
                      },
                    },
                    {
                      $unwind: {
                        path: '$userDetails',
                        preserveNullAndEmptyArrays: false,
                      },
                    },
                    // Lookup likes
                    {
                      $lookup: {
                        from: 'likes',
                        localField: '_id',
                        foreignField: 'postId',
                        as: 'likes',
                      },
                    },
                    {
                      $addFields: {
                        isLiked: {
                          $in: [currentUserObjectId, '$likes.userId'],
                        },
                        likeCount: { $size: '$likes' },
                      },
                    },
                    // Lookup saves
                    {
                      $lookup: {
                        from: 'saves',
                        localField: '_id',
                        foreignField: 'postId',
                        as: 'saveDetails',
                      },
                    },
                    // Lookup reposts for this post
                    {
                      $lookup: {
                        from: 'reposts',
                        localField: '_id',
                        foreignField: 'postId',
                        as: 'reposts',
                      },
                    },
                    {
                      $addFields: {
                        isSaved: {
                          $in: [currentUserObjectId, '$saveDetails.userId'],
                        },
                        repostCount: { $size: '$reposts' },
                        isReposted: {
                          $in: [currentUserObjectId, '$reposts.repostedBy'],
                        },
                      },
                    },
                    // Project fields
                    {
                      $project: {
                        _id: 1,
                        userId: 1,
                        text: 1,
                        media: 1,
                        location: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        viewCount: 1,
                        userDetails: 1,
                        isLiked: 1,
                        isSaved: 1,
                        likeCount: 1,
                        repostCount: 1,
                        isReposted: 1,
                      },
                    },
                  ],
                },
              },
              {
                $unwind: {
                  path: '$originalPost',
                  preserveNullAndEmptyArrays: true,
                },
              },
              // Final projection
              {
                $project: {
                  _id: 1,
                  text: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  repostedBy: '$repostedByDetails',
                  originalPost: 1,
                },
              },
            ],
            totalCount: [
              { $count: 'count' },
            ],
          },
        },
      ],
    });

    const reposts = result[0]?.reposts || [];
    const totalCount = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return responseHandler({
      reposts,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        pageLimit: limit,
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
    }, res);
  } catch (error) {
    console.error('Error fetching reposts:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Update repost text
 * PUT /repost/:repostId
 * Updates the text of an existing repost (ownership check)
 */
exports.updateRepost = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { repostId } = req.params;
  const { text } = req.value;

  try {
    // Validate repostId format
    if (!mongoose.Types.ObjectId.isValid(repostId)) {
      return res.status(400).json({
        code: 'ERR-INVALID-REPOST-ID',
        message: 'Invalid repost ID format',
      });
    }

    const repostObjectId = new mongoose.Types.ObjectId(repostId);

    // Find and update repost (with ownership check)
    const updatedRepost = await repostServices.findOneAndUpdate({
      filter: { _id: repostObjectId, repostedBy: userId },
      body: { text: text || null },
    });

    if (!updatedRepost) {
      return res.status(404).json({
        code: 'ERR-REPOST-NOT-FOUND',
        message: 'Repost not found or you do not have permission to update it',
      });
    }

    return responseHandler({
      message: 'Repost updated successfully',
      repost: {
        _id: updatedRepost._id,
        repostedBy: updatedRepost.repostedBy,
        postId: updatedRepost.postId,
        text: updatedRepost.text,
        createdAt: updatedRepost.createdAt,
        updatedAt: updatedRepost.updatedAt,
      },
    }, res);
  } catch (error) {
    console.error('Error updating repost:', error);
    return errorHandler('ERR-400', res);
  }
});
