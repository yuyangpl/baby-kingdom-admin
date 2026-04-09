import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface ITrend {
  pullId: string;
  source: 'medialens' | 'lihkg' | 'facebook';
  rank?: number;
  topicLabel: string;
  summary?: string;
  engagements?: number;
  postCount?: number;
  sensitivityTier: 1 | 2 | 3;
  sentimentScore?: number;
  sentimentLabel?: 'positive' | 'negative' | 'neutral';
  rawData?: Record<string, unknown>;
  feedIds: string[];
  createdAt: Date;
}

export type TrendDocument = HydratedDocument<ITrend>;

const trendSchema = new Schema<ITrend>(
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
    rawData: { type: Schema.Types.Mixed },
    feedIds: [String],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

trendSchema.index({ source: 1, createdAt: -1 });
trendSchema.index({ source: 1, topicLabel: 1 }, { unique: true });

const Trend = mongoose.model<ITrend>('Trend', trendSchema);

export default Trend;
