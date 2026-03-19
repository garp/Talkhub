const chatRoomWithMessageArray = () => [
  {
    $match: {},
  },
  {
    $lookup: {
      from: 'messages',
      localField: '_id',
      foreignField: 'chatroomId',
      pipeline: [
        {
          $lookup: {
            from: 'users',
            localField: 'senderId',
            foreignField: '_id',
            as: 'senderDetails',
          },
        },
        {
          $unwind: {
            path: '$senderDetails',
          },
        },
        {
          $project: {
            senderId: 1,
            content: 1,
            createdAt: 1,
            senderFullName: '$senderDetails.fullName', // Enhanced projection
          },
        },
      ],
      as: 'messages',
    },
  },
];

module.exports = {
  chatRoomWithMessageArray,
};
