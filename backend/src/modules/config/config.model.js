import mongoose from 'mongoose';

const configSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: '' },
    category: {
      type: String,
      required: true,
      enum: ['gemini', 'bk-forum', 'medialens', 'google-trends', 'scanner', 'general'],
    },
    description: { type: String, default: '' },
    isSecret: { type: Boolean, default: false },
    updatedBy: String,
  },
  { timestamps: true }
);

const Config = mongoose.model('Config', configSchema);

export default Config;
