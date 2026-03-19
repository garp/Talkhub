const { ObjectId } = require('mongodb');

exports.getAllPostsQuery = (filter = {}, sort = {}, pagination = {}, userId = null) => [
  {
    $match: {
      ...filter,
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      pipeline: [
        {
          $project: {
            _id: 1,
            location: 1,
            email: 1,
            fullName: 1,
            userName: 1,
            profilePicture: 1,
            description: 1,
            bannerPicture: 1,
          },
        },
      ],
      as: 'userDetails',
    },
  },
  {
    $unwind: {
      path: '$userDetails',
    },
  },
  // Attach interest category details
  {
    $lookup: {
      from: 'interestcategories',
      localField: 'interestCategories',
      foreignField: '_id',
      as: 'interestCategoryDetails',
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            slug: 1,
            icon: 1,
            backgroundImage: 1,
          },
        },
      ],
    },
  },
  // Attach interest subcategory details
  {
    $lookup: {
      from: 'interestsubcategories',
      localField: 'interestSubCategories',
      foreignField: '_id',
      as: 'interestSubCategoryDetails',
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            slug: 1,
            categoryId: 1,
            icon: 1,
            backgroundImage: 1,
          },
        },
      ],
    },
  },
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
        $in: [
          new ObjectId(userId),
          '$likes.userId',
        ],
      },
    },
  },
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
        $in: [
          new ObjectId(userId),
          '$saveDetails.userId',
        ],
      },
      viewCount: { $ifNull: ['$viewCount', 0] },
      repostCount: { $size: '$reposts' },
      isReposted: userId ? {
        $in: [
          new ObjectId(userId),
          '$reposts.repostedBy',
        ],
      } : false,
    },
  },
  {
    $lookup: {
      from: 'comments',
      localField: '_id',
      foreignField: 'postId',
      let: { postId: '$_id', currentUserId: userId ? new ObjectId(userId) : null },
      as: 'comments',
      pipeline: [
        {
          $match: {
            parentCommentId: null,
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'commentBy',
            foreignField: '_id',
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
            as: 'commentBy',
          },
        },
        {
          $unwind: {
            path: '$commentBy',
          },
        },
        {
          $lookup: {
            from: 'comment-likes',
            localField: '_id',
            foreignField: 'commentId',
            as: 'likes',
          },
        },
        {
          $lookup: {
            from: 'comments',
            localField: '_id',
            foreignField: 'parentCommentId',
            as: 'replies',
          },
        },
        {
          $addFields: {
            likeCount: { $size: '$likes' },
            replyCount: { $size: '$replies' },
            isLiked: {
              $cond: {
                if: { $eq: ['$$currentUserId', null] },
                then: false,
                else: {
                  $in: ['$$currentUserId', '$likes.userId'],
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            commentBy: 1,
            content: 1,
            postId: 1,
            likeCount: 1,
            replyCount: 1,
            isLiked: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $limit: 3,
        },
      ],
    },
  },
  {
    $sort: {
      ...sort,
    },
  },
  {
    $skip: pagination.skip,
  },
  {
    $limit: pagination.limit,
  },
];

exports.getSavedPostsQuery = (filter = {}, sort = {}, pagination = {}, userId = null) => [
  {
    $match: {
      ...filter,
    },
  },
  {
    $lookup: {
      from: 'posts',
      localField: 'postId',
      foreignField: '_id',
      as: 'post',
      pipeline: [
        {
          $lookup: {
            from: 'likes',
            localField: '_id',
            foreignField: 'postId',
            as: 'likeDetails',
          },
        },
        // Lookup reposts for saved posts
        {
          $lookup: {
            from: 'reposts',
            localField: '_id',
            foreignField: 'postId',
            as: 'repostDetails',
          },
        },
        {
          $addFields: {
            isLiked: {
              $in: [
                new ObjectId(userId),
                {
                  $map: {
                    input: '$likeDetails',
                    as: 'like',
                    in: '$$like.userId',
                  },
                },
              ],
            },
            viewCount: { $ifNull: ['$viewCount', 0] },
            repostCount: { $size: '$repostDetails' },
            isReposted: userId ? {
              $in: [
                new ObjectId(userId),
                {
                  $map: {
                    input: '$repostDetails',
                    as: 'repost',
                    in: '$$repost.repostedBy',
                  },
                },
              ],
            } : false,
          },
        },
      ],

    },
  },
  {
    $unwind: {
      path: '$post',
      preserveNullAndEmptyArrays: false,
    },
  },
  {
    $sort: {
      ...sort,
    },
  },
  {
    $skip: pagination.skip,
  },
  {
    $limit: pagination.limit,
  },
];

exports.getCommentsQuery = (filter = {}, sort = {}, pagination = {}, userId = null) => [
  {
    $match: {
      ...filter,
      parentCommentId: null,
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'commentBy',
      foreignField: '_id',
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
      as: 'commentBy',
    },
  },
  {
    $unwind: {
      path: '$commentBy',
    },
  },
  {
    $lookup: {
      from: 'comment-likes',
      localField: '_id',
      foreignField: 'commentId',
      as: 'likes',
    },
  },
  {
    $addFields: {
      likeCount: { $size: '$likes' },
      isLiked: userId ? {
        $in: [
          new ObjectId(userId),
          '$likes.userId',
        ],
      } : false,
    },
  },
  {
    $lookup: {
      from: 'comments',
      localField: '_id',
      foreignField: 'parentCommentId',
      as: 'replies',
    },
  },
  {
    $addFields: {
      replyCount: { $size: '$replies' },
    },
  },
  {
    $project: {
      likes: 0,
      replies: 0,
    },
  },
  {
    $sort: {
      ...sort,
    },
  },
  {
    $skip: pagination.skip,
  },
  {
    $limit: pagination.limit,
  },
];

/**
 * Get posts where a specific user has replied to comments.
 * Returns post details with attached replyDetails (comment + reply).
 */
exports.getPostRepliesByUserQuery = (targetUserId, currentUserId, sort = {}, pagination = {}) => [
  // Step 1: Find all replies made by the target user (comments with parentCommentId != null)
  {
    $match: {
      commentBy: new ObjectId(targetUserId),
      parentCommentId: { $ne: null },
    },
  },
  // Step 2: Sort and paginate the replies first
  {
    $sort: sort.createdAt ? sort : { createdAt: -1 },
  },
  {
    $skip: pagination.skip || 0,
  },
  {
    $limit: pagination.limit || 20,
  },
  // Step 3: Lookup the parent comment (the comment being replied to)
  {
    $lookup: {
      from: 'comments',
      localField: 'parentCommentId',
      foreignField: '_id',
      as: 'parentComment',
      pipeline: [
        {
          $lookup: {
            from: 'users',
            localField: 'commentBy',
            foreignField: '_id',
            as: 'commentByUser',
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
            path: '$commentByUser',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            content: 1,
            media: 1,
            postId: 1,
            commentBy: '$commentByUser',
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
    },
  },
  {
    $unwind: {
      path: '$parentComment',
      preserveNullAndEmptyArrays: false,
    },
  },
  // Step 4: Lookup the reply author details
  {
    $lookup: {
      from: 'users',
      localField: 'commentBy',
      foreignField: '_id',
      as: 'replyByUser',
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
      path: '$replyByUser',
      preserveNullAndEmptyArrays: true,
    },
  },
  // Step 5: Lookup the post
  {
    $lookup: {
      from: 'posts',
      localField: 'parentComment.postId',
      foreignField: '_id',
      as: 'post',
      pipeline: [
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
                  location: 1,
                  email: 1,
                  fullName: 1,
                  userName: 1,
                  profilePicture: 1,
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
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'interestcategories',
            localField: 'interestCategories',
            foreignField: '_id',
            as: 'interestCategoryDetails',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  slug: 1,
                  icon: 1,
                  backgroundImage: 1,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'interestsubcategories',
            localField: 'interestSubCategories',
            foreignField: '_id',
            as: 'interestSubCategoryDetails',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  slug: 1,
                  categoryId: 1,
                  icon: 1,
                  backgroundImage: 1,
                },
              },
            ],
          },
        },
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
            isLiked: currentUserId ? {
              $in: [new ObjectId(currentUserId), '$likes.userId'],
            } : false,
            likeCount: { $size: '$likes' },
          },
        },
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
            isSaved: currentUserId ? {
              $in: [new ObjectId(currentUserId), '$saveDetails.userId'],
            } : false,
            viewCount: { $ifNull: ['$viewCount', 0] },
            repostCount: { $size: '$reposts' },
            isReposted: currentUserId ? {
              $in: [new ObjectId(currentUserId), '$reposts.repostedBy'],
            } : false,
          },
        },
        {
          $lookup: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            as: 'allComments',
            pipeline: [
              { $match: { parentCommentId: null } },
            ],
          },
        },
        {
          $addFields: {
            commentCount: { $size: '$allComments' },
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            userDetails: 1,
            location: 1,
            text: 1,
            media: 1,
            labels: 1,
            interestCategories: 1,
            interestSubCategories: 1,
            interestCategoryDetails: 1,
            interestSubCategoryDetails: 1,
            replySettings: 1,
            extraReplySetting: 1,
            viewCount: 1,
            isLiked: 1,
            isSaved: 1,
            likeCount: 1,
            commentCount: 1,
            repostCount: 1,
            isReposted: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
    },
  },
  {
    $unwind: {
      path: '$post',
      preserveNullAndEmptyArrays: false,
    },
  },
  // Step 6: Shape the final output
  {
    $project: {
      _id: '$post._id',
      post: 1,
      replyDetails: {
        comment: '$parentComment',
        reply: {
          _id: '$_id',
          content: '$content',
          media: '$media',
          replyBy: '$replyByUser',
          replyTo: '$replyTo',
          parentCommentId: '$parentCommentId',
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
        },
      },
    },
  },
];

exports.getRepliesQuery = (filter = {}, sort = {}, pagination = {}, userId = null) => [
  {
    $match: {
      ...filter,
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'commentBy',
      foreignField: '_id',
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
      as: 'commentBy',
    },
  },
  {
    $unwind: {
      path: '$commentBy',
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'replyTo',
      foreignField: '_id',
      pipeline: [
        {
          $project: {
            _id: 1,
            fullName: 1,
            userName: 1,
          },
        },
      ],
      as: 'replyToUser',
    },
  },
  {
    $unwind: {
      path: '$replyToUser',
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: 'comment-likes',
      localField: '_id',
      foreignField: 'commentId',
      as: 'likes',
    },
  },
  {
    $addFields: {
      likeCount: { $size: '$likes' },
      isLiked: userId ? {
        $in: [
          new ObjectId(userId),
          '$likes.userId',
        ],
      } : false,
    },
  },
  {
    $project: {
      _id: 1,
      commentBy: 1,
      content: 1,
      media: 1,
      postId: 1,
      parentCommentId: 1,
      replyTo: 1,
      replyToUser: 1,
      likeCount: 1,
      isLiked: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  },
  {
    $sort: {
      ...sort,
    },
  },
  {
    $skip: pagination.skip,
  },
  {
    $limit: pagination.limit,
  },
];
