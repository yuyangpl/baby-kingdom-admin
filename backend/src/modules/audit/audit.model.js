import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
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
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    apiStatus: Number,
    ip: String,
    session: { type: String, enum: ['admin', 'worker', 'api'], default: 'admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // TTL 90 days default

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
