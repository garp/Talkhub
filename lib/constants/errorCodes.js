const commonError = {
  'ERR-001': {
    httpStatus: 400,
    message: 'Missing data in request',
  },
  'ERR-002': {
    httpStatus: 400,
    message: 'Invalid header',
  },
  'ERR-003': {
    httpStatus: 401,
    message: 'Invalid token',
  },
  'ERR-004': {
    httpStatus: 500,
    message: 'Server Error. Please try later',
  },
  'ERR-005': {
    httpStatus: 403,
    message: 'Unauthorized Operation',
  },
  'ERR-006': {
    httpStatus: 500,
    message: 'Exception occured',
  },
};

exports.errorCodes = {
  ...commonError,
  'ERR-101': {
    httpStatus: 400,
    message: 'Already exists',
  },
  'ERR-102': {
    httpStatus: 400,
    message: 'Please sign-up again',
  },
  'ERR-103': {
    httpStatus: 400,
    message: 'You have reached the maximum number of resend attempts',
  },
  'ERR-104': {
    httpStatus: 400,
    message: 'Invalid OTP',
  },
  'ERR-105': {
    httpStatus: 500,
    message: 'Invalid Password or Email/Phone Number',
  },
  'ERR-106': {
    httpStatus: 400,
    message: 'Invalid user to verify OTP',
  },
  'ERR-107': {
    httpStatus: 400,
    message: 'Wrong OTP',
  },
  'ERR-108': {
    httpStatus: 400,
    message: 'OTP expired',
  },
  'ERR-109': {
    httpStatus: 400,
    message: 'User not found',
  },
  'ERR-110': {
    httpStatus: 400,
    message: 'User not verified, please complete signup',
  },
  'ERR-111': {
    httpStatus: 400,
    message: 'User exist but wrong password',
  },
  'ERR-112': {
    httpStatus: 400,
    message: 'Please complete the signup process',
  },
  'ERR-113': {
    httpStatus: 400,
    message: 'Couldnt Signup User.',
  },
  'ERR-114': {
    httpStatus: 400,
    message: 'Hashtag not found.',
  },
  'ERR-115': {
    httpStatus: 400,
    message: 'Post not found.',
  },
  'ERR-116': {
    httpStatus: 400,
    message: 'Chatroom not found.',
  },
  'ERR-117': {
    httpStatus: 400,
    message: 'Parent hashtag not found.',
  },
  'ERR-118': {
    httpStatus: 400,
    message: 'Users can only join through parent hashtag , this is a sub hashtag.',
  },
  'ERR-119': {
    httpStatus: 400,
    message: 'Parent post not found',
  },
  'ERR-120': {
    httpStatus: 400,
    message: 'Post not found or you do not have permission to edit this post.',
  },
  'ERR-121': {
    httpStatus: 400,
    message: 'Invalid feed type',
  },
  'ERR-122': {
    httpStatus: 500,
    message: 'Couldnt update profile. please try again later.',
  },
  'ERR-123': {
    httpStatus: 400,
    message: 'Username already taken',
  },
  'ERR-124': {
    httpStatus: 400,
    message: 'user already blocked',
  },
  'ERR-125': {
    httpStatus: 400,
    message: 'Cant block urself',
  },
  'ERR-126': {
    httpStatus: 400,
    message: 'report already exists',
  },
  'ERR-127': {
    httpStatus: 400,
    message: 'participants do not exist in same chatroom',
  },
  'ERR-128': {
    httpStatus: 400,
    message: 'report not found',
  },
  'ERR-129': {
    httpStatus: 400,
    message: 'you are not an admin or moderator of this hashtag',
  },
  'ERR-130': {
    httpStatus: 400,
    message: 'error occured while taking action on report',
  },
  'ERR-131': {
    httpStatus: 400,
    message: 'Cannot follow yourself',
  },
  'ERR-132': {
    httpStatus: 400,
    message: 'Already following this user',
  },
  'ERR-133': {
    httpStatus: 400,
    message: 'Cannot follow due to block restriction',
  },
  'ERR-134': {
    httpStatus: 400,
    message: 'Not following this user',
  },
  'ERR-135': {
    httpStatus: 404,
    message: 'SubHashtag not found',
  },
  'ERR-136': {
    httpStatus: 404,
    message: 'Interest category not found',
  },
  'ERR-137': {
    httpStatus: 404,
    message: 'Interest subcategory not found',
  },
  'ERR-POST-404': {
    httpStatus: 404,
    message: 'Post not found.',
  },
  'ERR-138': {
    httpStatus: 400,
    message: 'Account is already marked for deletion',
  },
  'ERR-140': {
    httpStatus: 400,
    message: 'Cannot delete account. Please try again later.',
  },
  'ERR-400': {
    httpStatus: 400,
    message: 'Invalid request parameters',
  },
  'ERR-502': {
    httpStatus: 502,
    message: 'External service failure',
  },
  'ERR-141': {
    httpStatus: 400,
    message: 'Current password is incorrect',
  },
  'ERR-142': {
    httpStatus: 400,
    message: 'Password update failed. Please try again.',
  },
  'ERR-143': {
    httpStatus: 400,
    message: 'Invalid invite code. This referral code does not exist.',
  },
  'ERR-144': {
    httpStatus: 400,
    message: 'You cannot use your own referral code.',
  },
  'ERR-145': {
    httpStatus: 400,
    message: 'This referral code has expired.',
  },
  'ERR-146': {
    httpStatus: 400,
    message: 'This referral code has reached its usage limit.',
  },
  'ERR-147': {
    httpStatus: 400,
    message: 'No referral code exists. Generate one first.',
  },
  'ERR-148': {
    httpStatus: 400,
    message: 'Phone number already in use',
  },
  'ERR-149': {
    httpStatus: 400,
    message: 'Email already in use',
  },
  'ERR-150': {
    httpStatus: 400,
    message: 'You have already reported this group.',
  },
  'ERR-151': {
    httpStatus: 400,
    message: 'You are not a participant of this group.',
  },
};
