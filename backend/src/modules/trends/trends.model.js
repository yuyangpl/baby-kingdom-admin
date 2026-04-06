import mongoose from 'mongoose';

const trendSchema = new mongoose.Schema(
  {
    pullId: { type: String, required: true },
    source: { type: String, enum: ['medialens', 'lihkg', 'facebook'], required: true },
    rank: Number,
    topicLabel: { type: String, required: true },
    summary: String,
    engagements: Number,
    postCount: Number,
    sensitivityTier: { type: Number, enum: [1, 2, 3], default: 1 },
    sentimentScore: Number,
    sentimentLabel: { type: String, enum: ['positive', 'negative', 'neutral'] },
    toneMode: String,
    isUsed: { type: Boolean, default: false },
    usedAt: Date,
    feedIds: [String],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

trendSchema.index({ source: 1, createdAt: -1 });
trendSchema.index({ source: 1, topicLabel: 1 }, { unique: true });

const Trend = mongoose.model('Trend', trendSchema);

export default Trend;
