const storiesWithUser = (filter) => [
  {
    $match: filter,
  },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
];

exports.storiesWithUser = storiesWithUser;
