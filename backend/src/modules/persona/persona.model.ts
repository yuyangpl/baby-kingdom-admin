import mongoose, { Schema, HydratedDocument } from 'mongoose';
import { encrypt, isEncrypted } from '../../shared/encryption.js';

export interface IPersona {
  accountId: string;
  username: string;
  archetype: 'pregnant' | 'first-time-mom' | 'multi-kid' | 'school-age';
  primaryToneMode?: string;
  secondaryToneMode?: string;
  avoidedToneMode?: string;
  voiceCues: string[];
  catchphrases: string[];
  topicBlacklist: string[];
  tier3Script?: string;
  maxPostsPerDay: number;
  bkPassword?: string;
  bkUid?: number;
  bkToken?: string;
  bkTokenExpiry?: Date;
  tokenStatus: 'active' | 'expired' | 'none';
  lastPostAt?: Date;
  postsToday: number;
  cooldownUntil?: Date;
  overrideNotes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPersonaMethods {
  toJSON(): Record<string, unknown>;
}

export type PersonaDocument = HydratedDocument<IPersona, IPersonaMethods>;

const personaSchema = new Schema<IPersona, mongoose.Model<IPersona, object, IPersonaMethods>, IPersonaMethods>(
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

personaSchema.pre('save', function (next) {
  if (this.isModified('bkPassword') && this.bkPassword && !isEncrypted(this.bkPassword)) {
    this.bkPassword = encrypt(this.bkPassword);
  }
  next();
});

personaSchema.methods.toJSON = function () {
  const obj = this.toObject() as Record<string, unknown>;
  if (obj['bkPassword']) obj['bkPassword'] = '••••••••';
  delete obj['__v'];
  return obj;
};

const Persona = mongoose.model<IPersona, mongoose.Model<IPersona, object, IPersonaMethods>>('Persona', personaSchema);

export default Persona;
