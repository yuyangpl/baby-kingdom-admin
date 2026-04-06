import mongoose from 'mongoose';

const personaSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, unique: true, trim: true },
    username: { type: String, required: true },
    archetype: {
      type: String,
      enum: ['pregnant', 'first-time-mom', 'multi-kid', 'school-age'],
      required: true,
    },
    primaryToneMode: String,
    secondaryToneMode: String,
    avoidedToneMode: String,
    voiceCues: [String],
    catchphrases: [String],
    topicBlacklist: [String],
    tier3Script: String,
    maxPostsPerDay: { type: Number, default: 3 },
    bkPassword: String, // encrypted
    bkUid: Number,
    bkToken: String,
    bkTokenExpiry: Date,
    tokenStatus: { type: String, enum: ['active', 'expired', 'none'], default: 'none' },
    lastPostAt: Date,
    postsToday: { type: Number, default: 0 },
    cooldownUntil: Date,
    overrideNotes: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

personaSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.bkPassword) obj.bkPassword = '••••••••';
  delete obj.__v;
  return obj;
};

const Persona = mongoose.model('Persona', personaSchema);

export default Persona;
