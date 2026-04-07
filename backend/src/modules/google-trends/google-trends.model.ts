import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IGoogleTrendNews {
  headline: string;
  url: string;
}

export interface IGoogleTrendAnalysis {
  summary: string;
  parentingRelevance: 'high' | 'medium' | 'low' | 'none';
  suggestedAngle: string;
  safeToMention: boolean;
}

export interface IGoogleTrend {
  query: string;
  score: number;
  peakVolume: number;
  durationHours: number;
  categories: string[];
  trendBreakdown: string[];
  news: IGoogleTrendNews[];
  analysis: IGoogleTrendAnalysis | null;
  pullId: string;
  pulledAt: Date;
  geo: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GoogleTrendDocument = HydratedDocument<IGoogleTrend>;

const googleTrendNewsSchema = new Schema<IGoogleTrendNews>(
  { headline: String, url: String },
  { _id: false },
);

const googleTrendAnalysisSchema = new Schema<IGoogleTrendAnalysis>(
  {
    summary: String,
    parentingRelevance: { type: String, enum: ['high', 'medium', 'low', 'none'] },
    suggestedAngle: String,
    safeToMention: Boolean,
  },
  { _id: false },
);

const googleTrendSchema = new Schema<IGoogleTrend>(
  {
    query: { type: String, required: true },
    score: { type: Number, default: 0 },
    peakVolume: { type: Number, default: 0 },
    durationHours: { type: Number, default: 0 },
    categories: [String],
    trendBreakdown: [String],
    news: [googleTrendNewsSchema],
    analysis: { type: googleTrendAnalysisSchema, default: null },
    pullId: { type: String, required: true },
    pulledAt: { type: Date, required: true },
    geo: { type: String, default: 'HK' },
  },
  { timestamps: true },
);

googleTrendSchema.index({ pullId: 1 });
googleTrendSchema.index({ pulledAt: -1 });
googleTrendSchema.index({ query: 1, pullId: 1 }, { unique: true });

const GoogleTrend = mongoose.model<IGoogleTrend>('GoogleTrend', googleTrendSchema);
export default GoogleTrend;
