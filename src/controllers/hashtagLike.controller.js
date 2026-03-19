const hashtagServices = require('../services/hashtagServices');
const hashtagLikeServices = require('../services/hashtagLikeServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');

exports.likeHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const hashtag = await hashtagServices.findById({
    id: hashtagId,
  });

  if (!hashtag) {
    return errorHandler('ERR-115', res);
  }

  const like = await hashtagLikeServices.findOneAndUpsert({
    filter: { hashtagId, userId },
    body: { hashtagId, userId },
  });

  if (like.createdAt.getTime() === like.updatedAt.getTime()) {
    await hashtagServices.findByIdAndUpdate({
      id: hashtagId,
      body: { $inc: { likeCount: 1 } },
    });
    return responseHandler({ message: 'Hashtag liked successfully' }, res);
  }

  return responseHandler({ message: 'Hashtag already liked.' }, res);
});

exports.unlikeHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const result = await hashtagLikeServices.deleteOne({
    filter: { hashtagId, userId },
  });

  if (result.deletedCount === 0) {
    return responseHandler({ message: 'Like not found.' }, res);
  }

  await hashtagServices.findByIdAndUpdate({
    id: hashtagId,
    body: { $inc: { likeCount: -1 } },
  });

  return responseHandler({ message: 'Hashtag unliked successfully.' }, res);
});

// exports.getAllLikes = asyncHandler(async (req, res) => {
//   let { postId } = req.params;
//   postId = new mongoose.Types.ObjectId(postId);
//   const { pageNum, pageSize } = req.value;
//   const page = Number(pageNum);
//   const limit = Number(pageSize);
//   const skip = (page - 1) * limit;

//   // Aggregation pipeline to get likes and count
//   const aggregationPipeline = [
//     {
//       $match: { postId }, // Match likes for the specific post
//     },
//     {
//       $facet: {
//         likes: [
//           { $sort: { createdAt: -1 } }, // Sort likes by createdAt descending
//           { $skip: skip }, // Apply pagination skip
//           { $limit: limit }, // Apply pagination limit
//           {
//             $lookup: {
//               from: 'users',
//               localField: 'userId',
//               foreignField: '_id',
//               as: 'user',
//             },
//           },
//           {
//             $unwind: {
//               path: '$user',
//               preserveNullAndEmptyArrays: false,
//             },
//           },
//           {
//             $project: {
//               _id: 1,
//               postId: 1,
//               createdAt: 1,
//               updatedAt: 1,
//               'user._id': 1,
//               'user.userName': 1,
//               'user.fullName': 1,
//               'user.profilePicture': 1,
//             },
//           },
//         ],
//         totalCount: [
//           { $count: 'count' }, // Count the total likes
//         ],
//       },
//     },
//   ];

//   // Execute the aggregation
//   const result = await likeServices.aggregate({ query: aggregationPipeline });

//   // Extract likes and count from the result
//   const likes = result[0].likes || []; // Likes for the current page
//   const totalLikes = result[0] && result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

//   // Calculate total pages
//   const totalPages = Math.ceil(totalLikes / limit);

//   // Respond with likes and pagination info
//   return responseHandler({
//     metadata: {
//       totalLikes,
//       totalPages,
//       pageNum,
//       pageSize,
//     },
//     likes,
//   }, res);
// });
