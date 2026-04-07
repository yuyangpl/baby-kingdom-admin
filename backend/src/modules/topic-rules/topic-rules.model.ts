import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface ITopicRule {
  ruleId: string;
  topicKeywords: string[];
  sensitivityTier: 1 | 2 | 3;
  sentimentTrigger: 'any' | 'positive' | 'negative';
  priorityAccountIds: string[];
  assignToneMode: string;
  postTypePreference: 'new-post' | 'reply' | 'any';
  geminiPromptHint?: string;
  avoidIf?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TopicRuleDocument = HydratedDocument<ITopicRule>;

const topicRuleSchema = new Schema<ITopicRule>(
  {
    ruleId: { type: String, required: true, unique: true, trim: true },
    topicKeywords: { type: [String], required: true },
    sensitivityTier: { type: Number, enum: [1, 2, 3], default: 1 },
    sentimentTrigger: { type: String, enum: ['any', 'positive', 'negative'], default: 'any' },
    priorityAccountIds: [String],
    assignToneMode: { type: String, default: 'auto' },
    postTypePreference: { type: String, enum: ['new-post', 'reply', 'any'], default: 'any' },
    geminiPromptHint: String,
    avoidIf: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const TopicRule = mongoose.model<ITopicRule>('TopicRule', topicRuleSchema);

export default TopicRule;
