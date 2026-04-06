import mongoose from 'mongoose';

const queueJobSchema = new mongoose.Schema(
  {
    queueName: {
      type: String,
      required: true,
      enum: ['scanner', 'trends', 'poster', 'daily-reset', 'stats-aggregator', 'ml-token-refresh'],
    },
    jobId: String,
    status: {
      type: String,
      enum: ['waiting', 'active', 'completed', 'failed'],
      default: 'waiting',
    },
    startedAt: Date,
    completedAt: Date,
    duration: Number, // ms
    result: mongoose.Schema.Types.Mixed,
    error: String,
    triggeredBy: { type: String, enum: ['cron', 'manual'], default: 'cron' },
    triggeredByUser: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

queueJobSchema.index({ queueName: 1, status: 1, createdAt: -1 });

const QueueJob = mongoose.model('QueueJob', queueJobSchema);

export default QueueJob;
