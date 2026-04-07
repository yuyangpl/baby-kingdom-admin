import mongoose, { Schema, HydratedDocument } from 'mongoose';

// Forum Category
export interface IForumCategory {
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ForumCategoryDocument = HydratedDocument<IForumCategory>;

const forumCategorySchema = new Schema<IForumCategory>(
  {
    name: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ForumCategory = mongoose.model<IForumCategory>('ForumCategory', forumCategorySchema);

// Persona Binding (subdocument)
export interface IPersonaBinding {
  personaId: mongoose.Types.ObjectId;
  toneMode?: string;
  weight: 'high' | 'medium' | 'low';
  dailyLimit: number;
}

const personaBindingSchema = new Schema<IPersonaBinding>(
  {
    personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true },
    toneMode: String,
    weight: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    dailyLimit: { type: Number, default: 3 },
  },
  { _id: false }
);

// Forum Board
export interface IForumBoard {
  categoryId: mongoose.Types.ObjectId;
  name: string;
  fid: number;
  enableScraping: boolean;
  enableAutoReply: boolean;
  replyThreshold: {
    min: number;
    max: number;
  };
  scanInterval: number;
  defaultToneMode?: string;
  sensitivityTier: 1 | 2 | 3;
  note?: string;
  isActive: boolean;
  personaBindings: IPersonaBinding[];
  createdAt: Date;
  updatedAt: Date;
}

export type ForumBoardDocument = HydratedDocument<IForumBoard>;

const forumBoardSchema = new Schema<IForumBoard>(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'ForumCategory', required: true },
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

export const ForumBoard = mongoose.model<IForumBoard>('ForumBoard', forumBoardSchema);
