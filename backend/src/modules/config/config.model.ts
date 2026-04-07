import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IConfig {
  key: string;
  value: string;
  category: 'gemini' | 'bk-forum' | 'medialens' | 'google-trends' | 'scanner' | 'email' | 'general';
  description: string;
  isSecret: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfigDocument = HydratedDocument<IConfig>;

const configSchema = new Schema<IConfig>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: '' },
    category: {
      type: String,
      required: true,
      enum: ['gemini', 'bk-forum', 'medialens', 'google-trends', 'scanner', 'email', 'general'],
    },
    description: { type: String, default: '' },
    isSecret: { type: Boolean, default: false },
    updatedBy: String,
  },
  { timestamps: true }
);

const Config = mongoose.model<IConfig>('Config', configSchema);

export default Config;
