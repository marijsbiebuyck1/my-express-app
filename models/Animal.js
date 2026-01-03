import mongoose from "mongoose";

const AttributesSchema = new mongoose.Schema(
  {
    species: { type: String },
    breed: { type: String },
    sex: { type: String, enum: ["male", "female", "unknown"] },
    size: { type: String, enum: ["small", "medium", "large", "unknown"] },
    characteristics: [{ type: String }],
    traits: [{ type: String }],
    // added fields for match/profile UI
    gardenAccess: { type: Boolean },
    // compatibility with other animals (e.g. ['cats','dogs','rodents'])
    otherAnimals: [{ type: String }],
    // children compatibility: exclusive option
    childrenCompatibility: {
      type: String,
      enum: ["no", "younger_than_6", "6_to_14", "14_plus"],
    },
    // specific cat type (if species is cat)
    catType: { type: String, enum: ["indoor", "outdoor", "cuddle", "farm"] },
    notes: { type: String },
  },
  { _id: false }
);

const animalSchema = new mongoose.Schema(
  {
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      required: false,
    },
    name: { type: String, required: true },
    birthdate: { type: Date, required: true },
   photo: { type: String },
  description: { type: String, required: true },
    status: {
      type: String,
      enum: ["available", "adopted", "fostered", "pending"],
      default: "available",
    },
    attributes: { type: AttributesSchema, default: {} },
  },
  { timestamps: true }
);

animalSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Animal = mongoose.model("Animal", animalSchema);
export default Animal;
