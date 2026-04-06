import mongoose from 'mongoose';

// Forum Category
const forumCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ForumCategory = mongoose.model('ForumCategory', forumCategorySchema);

// Forum Board
const personaBindingSchema = new mongoose.Schema(
  {
    personaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Persona', required: true },
    toneMode: String,
    weight: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    dailyLimit: { type: Number, default: 3 },
  },
  { _id: false }
);

const forumBoardSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumCategory', required: true },
    name: { type: String, required: true },
    fid: { type: Number, required: true },
    enableScraping: { type: Boolean, default: false },
    enableAutoReply: { type: Boolean, default: false },
    replyThreshold: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 40 },
    },
    scanInterval: { type: Number, default: 30 }, // minutes
    defaultToneMode: String,
    sensitivityTier: { type: Number, enum: [1, 2, 3], default: 1 },
    note: String,
    isActive: { type: Boolean, default: true },
    personaBindings: [personaBindingSchema],
  },
  { timestamps: true }
);

forumBoardSchema.index({ fid: 1 }, { unique: true });

export const ForumBoard = mongoose.model('ForumBoard', forumBoardSchema);
