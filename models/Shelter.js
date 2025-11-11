import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String },
    city: { type: String },
    postal: { type: String },
    country: { type: String },
  },
  { _id: false }
);

const OpeningHoursSchema = new mongoose.Schema(
  {
    monFri: { type: String },
    saturday: { type: String },
    sunday: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const AnimalSummarySchema = new mongoose.Schema(
  {
    species: { type: String },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const shelterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    address: { type: AddressSchema, default: {} },
    phone: { type: String },
    region: { type: String },
    profileImage: { type: String },
    capacity: { type: Number },
    openingHours: { type: OpeningHoursSchema, default: {} },
    animalsSummary: [{ type: AnimalSummarySchema }],
    contactPerson: { type: String },
    role: { type: String, enum: ["shelter", "admin"], default: "shelter" },
  },
  { timestamps: true }
);

// Helper to set password (not required but useful if creating via model)
shelterSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

shelterSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash; // hide password hash
    return ret;
  },
});

const Shelter = mongoose.model("Shelter", shelterSchema);
export default Shelter;
