import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IQueueJob {
  queueName: 'scanner' | 'trends' | 'poster' | 'daily-reset' | 'stats-aggregator' | 'ml-token-refresh';
  jobId?: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number; // ms
  result?: unknown;
  error?: string;
  triggeredBy: 'cron' | 'manual';
  triggeredByUser?: string;
  createdAt: Date;
}

export type QueueJobDocument = HydratedDocument<IQueueJob>;

const queueJobSchema = new Schema<IQueueJob>(
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
    result: Schema.Types.Mixed,
    error: String,
    triggeredBy: { type: String, enum: ['cron', 'manual'], default: 'cron' },
    triggeredByUser: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

queueJobSchema.index({ queueName: 1, status: 1, createdAt: -1 });

const QueueJob = mongoose.model<IQueueJob>('QueueJob', queueJobSchema);

export default QueueJob;
