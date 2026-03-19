const mongoose = require('mongoose');
const postServices = require('../services/postServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');

exports.createReply = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { postId } = req.params;
  const { content, hashtags } = req.value;

  // Validate parent post exists
  const parentPost = await postServices.findById({ id: postId });
  if (!parentPost) {
    return errorHandler('ERR-115', res);
  }

  // Create reply
  const replyPost = await postServices.create({
    body: {
      userId,
      parentPostId: postId,
      content,
      hashtags: hashtags || [],
    },
  });

  if (replyPost) {
    await postServices.findByIdAndUpdate({
      id: postId,
      body: { $inc: { repliesCount: 1 } },
    });
  }

  return responseHandler({ replyPost }, res);
});

exports.getAllReplies = asyncHandler(async (req, res) => {
  let { postId } = req.params;
  postId = new mongoose.Types.ObjectId(postId);
  const { pageNum, pageSize } = req.value;

  const page = Number(pageNum);
  const limit = Number(pageSize);

  // Calculate pagination options
  const skip = (page - 1) * limit;

  // Aggregation pipeline to get replies and count
  const aggregationPipeline = [
    {
      $match: { parentPostId: postId },
    },
    {
      $facet: {
        replies: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
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
              viewCount: { $ifNull: ['$viewCount', 0] },
            },
          },
          {
            $project: {
              _id: 1,
              hashtags: 1,
              content: 1,
              viewCount: 1,
              likeCount: 1,
              repliesCount: 1,
              parentPostId: 1,
              createdAt: 1,
              updatedAt: 1,
              'user._id': 1,
              'user.userName': 1,
              'user.profilePicture': 1,
              'user.fullName': 1,
            },
          },
        ],
        totalCount: [
          { $count: 'count' },
        ],
      },
    },
  ];

  // Execute the aggregation
  const result = await postServices.aggregate({ query: aggregationPipeline });

  // Extract replies and count from the result
  const replies = result[0].replies || []; // Replies for the current page
  const totalReplies = (result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0);

  // Calculate total pages
  const totalPages = Math.ceil(totalReplies / limit);

  // Respond with replies and pagination info
  return responseHandler({
    replies,
    pagination: {
      totalReplies,
      totalPages,
      currentPage: page,
      limit,
    },
  }, res);
});
