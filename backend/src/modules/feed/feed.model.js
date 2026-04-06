import mongoose from 'mongoose';

const feedSchema = new mongoose.Schema(
  {
    feedId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['thread', 'reply'], default: 'reply' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'posted', 'failed'],
      default: 'pending',
    },
    source: { type: String, enum: ['scanner', 'trends', 'custom'], required: true },
    // Thread info
    threadTid: Number,
    threadFid: Number,
    threadSubject: String,
    threadContent: String,
    subject: String, // new post title
    // Trend source info
    trendSource: String, // viral-topics / lihkg / fb-viral / SCAN / CUSTOM
    trendSentiment: Number,
    trendEngagement: Number,
    pullTime: Date,
    // Generated content
    personaId: String,
    bkUsername: String,
    displayName: String,
    archetype: String,
    toneMode: String,
    sensitivityTier: String,
    postType: { type: String, enum: ['new-post', 'reply'], default: 'reply' },
    draftContent: String,
    finalContent: String,
    charCount: Number,
    adminEdit: { type: Boolean, default: false },
    // Gemini evaluation
    relevanceScore: Number,
    worthReplying: Boolean,
    // Google Trends
    googleTrends: {
      matched: Boolean,
      trendTitle: String,
      trendTraffic: String,
      matchScore: Number,
    },
    // Post result
    postedAt: Date,
    postId: String,
    postUrl: String,
    failReason: String,
    // Claim
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claimedAt: Date,
    // Review
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    adminNotes: String,
    // Quality
    qualityWarnings: [String],
    isDuplicate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

feedSchema.index({ status: 1, createdAt: -1 });
feedSchema.index({ threadTid: 1, personaId: 1 }, { unique: true, sparse: true });
feedSchema.index({ personaId: 1, status: 1 });
feedSchema.index({ threadFid: 1, status: 1 });
feedSchema.index({ claimedBy: 1, claimedAt: 1 });
feedSchema.index({ source: 1, createdAt: -1 });

const Feed = mongoose.model('Feed', feedSchema);

export default Feed;
