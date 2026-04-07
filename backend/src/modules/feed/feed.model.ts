import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IGoogleTrends {
  matched?: boolean;
  trendTitle?: string;
  trendTraffic?: string;
  matchScore?: number;
}

export interface IFeed {
  feedId: string;
  type: 'thread' | 'reply';
  status: 'pending' | 'approved' | 'rejected' | 'posted' | 'failed';
  source: 'scanner' | 'trends' | 'custom';
  // Thread info
  threadTid?: number;
  threadFid?: number;
  threadSubject?: string;
  threadContent?: string;
  subject?: string;
  // Trend source info
  trendSource?: string;
  trendSentiment?: number;
  trendEngagement?: number;
  pullTime?: Date;
  // Generated content
  personaId?: string;
  bkUsername?: string;
  displayName?: string;
  archetype?: string;
  toneMode?: string;
  sensitivityTier?: string;
  postType: 'new-post' | 'reply';
  draftContent?: string;
  finalContent?: string;
  charCount?: number;
  adminEdit: boolean;
  // Gemini evaluation
  relevanceScore?: number;
  worthReplying?: boolean;
  // Google Trends
  googleTrends?: IGoogleTrends;
  // Post result
  postedAt?: Date;
  postId?: string;
  postUrl?: string;
  failReason?: string;
  // Claim
  claimedBy?: mongoose.Types.ObjectId | null;
  claimedAt?: Date;
  // Review
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date;
  adminNotes?: string;
  // Quality
  qualityWarnings: string[];
  isDuplicate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type FeedDocument = HydratedDocument<IFeed>;

const feedSchema = new Schema<IFeed>(
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
    subject: String,
    // Trend source info
    trendSource: String,
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
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    claimedAt: Date,
    // Review
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

const Feed = mongoose.model<IFeed>('Feed', feedSchema);

export default Feed;
