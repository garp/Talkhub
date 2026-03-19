const mongoose = require('mongoose');
const reportServices = require('../services/reportServices');
const groupReportServices = require('../services/groupReportServices');
const chatroomServices = require('../services/chatroomServices');
const participantServices = require('../services/participantServices');
const privateChatroomServices = require('../services/privateChatroomServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const { reportStatus } = require('../../lib/constants/userConstants');

exports.reportUser = asyncHandler(async (req, res) => {
  const {
    reportedToId,
    hashtagId,
    reason,
  } = req.value;

  const { userId: reportedById } = req.user;
  const ifReportExists = await reportServices.findOne({
    filter: { reportedById, reportedToId, hashtagId },
  });
  if (ifReportExists) {
    return errorHandler('ERR-126', res);
  }
  const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });

  if (!chatroom) {
    return errorHandler('ERR-114', res);
  }

  const reportingParticipant = await participantServices.findOne({
    filter: { chatroomId: chatroom._id, userId: reportedById },
  });

  const reportedParticipant = await participantServices.findOne({
    filter: { chatroomId: chatroom._id, userId: reportedToId },
  });

  if (reportedParticipant && reportingParticipant) {
    const data = {
      reportedById,
      reportedToId,
      hashtagId,
      reason,
      status: reportStatus.PENDING,
    };
    await reportServices.create({
      body: data,
    });
  } else {
    return errorHandler('ERR-127', res);
  }

  return responseHandler('report created successfully', res);
});

exports.getAllReports = asyncHandler(async (req, res) => {
  let { hashtagId } = req.value;
  const id = new mongoose.Types.ObjectId(req.user.userId);
  hashtagId = new mongoose.Types.ObjectId(hashtagId);
  const chatroom = await chatroomServices.findOne({
    filter: { hashtagId },
    projection: { admins: 1, moderators: 1 },
  });
  if (!chatroom) {
    return errorHandler('ERR-116', res);
  }
  const adminIds = chatroom.admins.map((admin) => admin.userId);
  const moderatorIds = chatroom.moderators.map((moderator) => moderator.userId);
  const combinedIds = adminIds.concat(moderatorIds);
  const isUserAuthorized = combinedIds.some((combinedId) => combinedId.equals(id));
  if (!isUserAuthorized) {
    return errorHandler('ERR-129', res);
  }
  const query = [
    {
      $match: { hashtagId, status: reportStatus.PENDING },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'reportedById',
        foreignField: '_id',
        as: 'reportingUserDetails',
        pipeline: [
          {
            $project: { userName: 1, fullName: 1, profilePicture: 1 },
          },
        ],
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'reportedToId',
        foreignField: '_id',
        as: 'reportedserDetails',
        pipeline: [
          {
            $project: { userName: 1, fullName: 1, profilePicture: 1 },
          },
        ],
      },
    },
    {
      $project: {
        reportedById: 1,
        reportedToId: 1,
        reportingUserDetails: 1,
        reportedserDetails: 1,
        status: 1,
        createdAt: 1,
      },
    },
  ];
  const reports = await reportServices.aggregate({ query });
  return responseHandler(reports, res);
});

exports.actionReport = asyncHandler(async (req, res) => {
  const { reportId, action } = req.value;
  const _id = new mongoose.Types.ObjectId(reportId);
  const report = await reportServices.findOne({
    filter: { _id, status: reportStatus.PENDING },
  });
  if (!report) {
    return errorHandler('ERR-128', res);
  }
  const chatroom = await chatroomServices.findOne({
    filter: { hashtagId: report.hashtagId },
  });
  if (!chatroom) {
    return errorHandler('ERR-116', res);
  }
  if (action === reportStatus.REJECT) {
    await reportServices.findByIdAndUpdate({
      id: reportId,
      body: {
        $set: { status: reportStatus.REJECT, actionAt: new Date() },
      },
    });
    return responseHandler('report rejected', res);
  }

  if (action === reportStatus.APPROVED) {
    await reportServices.findByIdAndUpdate({
      id: reportId,
      body: {
        $set: { status: reportStatus.APPROVED, actionAt: new Date() },
      },
    });

    await participantServices.deleteOne({
      filter: { userId: report.reportedToId, chatroomId: chatroom._id },
    });
    return responseHandler('report approved', res);
  }
  return errorHandler('ERR-130', res);
});

/**
 * Report a group/chatroom. Optionally leave the group after reporting (leaveAfterReport: true).
 * Frontend can show two buttons: "Report only" (leaveAfterReport: false) and "Report and leave" (leaveAfterReport: true).
 */
exports.reportGroup = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    chatroomId, chatroomType, reason, leaveAfterReport = false,
  } = req.value;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const existingReport = await groupReportServices.findOne({
    filter: { reportedById: userObjectId, chatroomId: chatroomObjectId },
  });

  let isParticipant = false;

  if (chatroomType === 'hashtag') {
    const chatroom = await chatroomServices.findById({ id: chatroomObjectId });
    if (!chatroom) {
      return errorHandler('ERR-116', res);
    }
    const participant = await participantServices.findOne({
      filter: { chatroomId: chatroomObjectId, userId: userObjectId },
    });
    isParticipant = !!participant;
  } else if (chatroomType === 'private') {
    const chatroom = await privateChatroomServices.findById({ id: chatroomObjectId });
    if (!chatroom) {
      return errorHandler('ERR-116', res);
    }
    const participant = (chatroom.participants || []).find(
      (p) => p && p.userId && p.userId.toString() === userObjectId.toString(),
    );
    isParticipant = !!participant && participant.isPresent !== false;
  } else {
    return errorHandler('ERR-400', res);
  }

  if (!isParticipant) {
    return errorHandler('ERR-151', res);
  }

  // Already reported: do not create a new entry; still perform leave if leaveAfterReport is true
  if (!existingReport) {
    await groupReportServices.create({
      body: {
        reportedById: userObjectId,
        chatroomId: chatroomObjectId,
        chatroomType,
        reason: reason.trim(),
        status: reportStatus.PENDING,
      },
    });
  }

  if (leaveAfterReport) {
    if (chatroomType === 'hashtag') {
      await participantServices.deleteOne({
        filter: { userId: userObjectId, chatroomId: chatroomObjectId },
      });
    } else {
      // Private group: same exit flow as exitPrivateChatroom (delete for me so group disappears from list)
      const chatroom = await privateChatroomServices.findById({ id: chatroomObjectId });
      const now = new Date();
      const effectiveDeleteForMe = true;

      let promotedAdminUserId = null;
      const isAdmin = (chatroom.admins || []).some(
        (a) => a && a.userId && a.userId.toString() === userObjectId.toString(),
      );
      if (chatroom.isGroupChat && isAdmin) {
        const remainingPresent = (chatroom.participants || [])
          .filter((p) => p && p.userId && p.userId.toString() !== userObjectId.toString())
          .filter((p) => p.isPresent !== false)
          .map((p) => p.userId);
        const remainingAdmins = (chatroom.admins || [])
          .map((a) => (a && a.userId ? a.userId.toString() : null))
          .filter(Boolean)
          .filter((aid) => aid !== userObjectId.toString());
        if (remainingAdmins.length === 0 && remainingPresent.length > 0) {
          promotedAdminUserId = remainingPresent[0].toString();
        }
      }

      await privateChatroomServices.findOneAndUpdate({
        filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
        body: {
          $set: {
            'participants.$.isPresent': false,
            'participants.$.exitedAt': now,
            'participants.$.deletedForMe': effectiveDeleteForMe,
            'participants.$.deletedAt': now,
          },
          $pull: {
            admins: { userId: userObjectId },
            moderators: { userId: userObjectId },
            exParticipants: { userId: userObjectId },
          },
        },
      });

      await privateChatroomServices.findByIdAndUpdate({
        id: chatroomObjectId,
        body: { $push: { exParticipants: { userId: userObjectId, exitedAt: now, reason: 'left' } } },
      });

      if (promotedAdminUserId) {
        await privateChatroomServices.findByIdAndUpdate({
          id: chatroomObjectId,
          body: { $addToSet: { admins: { userId: new mongoose.Types.ObjectId(promotedAdminUserId) } } },
        });
      }
    }
  }

  let message;
  if (leaveAfterReport) {
    message = existingReport
      ? 'You have left the group.'
      : 'Report submitted. You have left the group.';
  } else {
    message = 'Report submitted successfully. We will review it.';
  }

  return responseHandler({ message, leaveAfterReport }, res);
});
