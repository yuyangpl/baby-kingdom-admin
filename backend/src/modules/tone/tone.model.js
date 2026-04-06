import mongoose from 'mongoose';

const toneModeSchema = new mongoose.Schema(
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

const ToneMode = mongoose.model('ToneMode', toneModeSchema);

export default ToneMode;
