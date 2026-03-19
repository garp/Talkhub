const mongoose = require('mongoose');

const { Schema } = mongoose;
const { reportStatus } = require('../../lib/constants/userConstants');

const reportSchema = new Schema(
  {
    reportedById: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    reportedToId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    hashtagId: {
      type: Schema.Types.ObjectId,
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

// Indexes for performance optimization
reportSchema.index({ reportedById: 1 }); // Reports by user
reportSchema.index({ reportedToId: 1 }); // Reports against user
reportSchema.index({ hashtagId: 1 }); // Reports in hashtag
reportSchema.index({ status: 1 }); // Filter by status
reportSchema.index({ createdAt: -1 }); // Sort by creation date
reportSchema.index({ status: 1, createdAt: -1 }); // Pending reports sorted
reportSchema.index({ hashtagId: 1, status: 1 }); // Hashtag reports by status

module.exports = mongoose.model('reports', reportSchema);
