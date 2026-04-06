import mongoose from 'mongoose';

const topicRuleSchema = new mongoose.Schema(
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

const TopicRule = mongoose.model('TopicRule', topicRuleSchema);

export default TopicRule;
