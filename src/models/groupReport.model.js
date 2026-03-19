const mongoose = require('mongoose');

const { Schema } = mongoose;
const { reportStatus } = require('../../lib/constants/userConstants');

const groupReportSchema = new Schema(
  {
    reportedById: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    chatroomId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    chatroomType: {
      type: String,
      enum: ['hashtag', 'private'],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [reportStatus.APPROVED, reportStatus.PENDING, reportStatus.REJECT],
      required: true,
    },
    actionAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

groupReportSchema.index({ reportedById: 1, chatroomId: 1 }, { unique: true });
groupReportSchema.index({ chatroomId: 1 });
groupReportSchema.index({ chatroomType: 1 });
groupReportSchema.index({ status: 1 });
groupReportSchema.index({ createdAt: -1 });
groupReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('groupReports', groupReportSchema);
