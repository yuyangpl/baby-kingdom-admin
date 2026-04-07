import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IAuditLog {
  operator: string;
  eventType: string;
  module: 'feed' | 'persona' | 'tone' | 'topic-rules' | 'forum' | 'queue' | 'config' | 'auth' | 'scanner' | 'trends' | 'poster' | 'gemini';
  feedId?: string;
  targetId?: string;
  bkUsername?: string;
  actionDetail?: string;
  before?: unknown;
  after?: unknown;
  apiStatus?: number;
  ip?: string;
  session: 'admin' | 'worker' | 'api';
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog>(
  {
    operator: { type: String, required: true }, // userId or 'system'
    eventType: { type: String, required: true },
    module: {
      type: String,
      required: true,
      enum: ['feed', 'persona', 'tone', 'topic-rules', 'forum', 'queue', 'config', 'auth', 'scanner', 'trends', 'poster', 'gemini'],
    },
    feedId: String,
    targetId: String,
    bkUsername: String,
    actionDetail: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    apiStatus: Number,
    ip: String,
    session: { type: String, enum: ['admin', 'worker', 'api'], default: 'admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // TTL 90 days default

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
