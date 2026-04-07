import mongoose, { Schema, HydratedDocument } from 'mongoose';

export interface IToneMode {
  toneId: string;
  displayName: string;
  whenToUse?: string;
  emotionalRegister?: string;
  openingStyle?: string;
  sentenceStructure?: string;
  whatToAvoid?: string;
  exampleOpening?: string;
  suitableForTier3: boolean;
  overridePriority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ToneModeDocument = HydratedDocument<IToneMode>;

const toneModeSchema = new Schema<IToneMode>(
  {
    toneId: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true },
    whenToUse: String,
    emotionalRegister: String,
    openingStyle: String,
    sentenceStructure: String,
    whatToAvoid: String,
    exampleOpening: String,
    suitableForTier3: { type: Boolean, default: false },
    overridePriority: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ToneMode = mongoose.model<IToneMode>('ToneMode', toneModeSchema);

export default ToneMode;
