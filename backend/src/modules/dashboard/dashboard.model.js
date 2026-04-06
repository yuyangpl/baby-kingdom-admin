import mongoose from 'mongoose';

const dailyStatsSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    scanner: {
      totalScanned: { type: Number, default: 0 },
      totalHit: { type: Number, default: 0 },
      hitRate: { type: Number, default: 0 },
    },
    feeds: {
      generated: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      posted: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    trends: {
      pulled: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
    },
    posts: {
      threads: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
    },
    byBoard: [{
      fid: Number,
      name: String,
      scanned: { type: Number, default: 0 },
      hit: { type: Number, default: 0 },
      posted: { type: Number, default: 0 },
    }],
    byPersona: [{
      personaId: String,
      username: String,
      posted: { type: Number, default: 0 },
      dailyLimit: { type: Number, default: 0 },
      rejectedCount: { type: Number, default: 0 },
    }],
    gemini: {
      calls: { type: Number, default: 0 },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      estimatedCost: { type: Number, default: 0 },
    },
    quality: {
      approvalRate: { type: Number, default: 0 },
      avgReviewTime: { type: Number, default: 0 },
      duplicateCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

export default DailyStats;
