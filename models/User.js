import mongoose from 'mongoose';

const PreferencesSchema = new mongoose.Schema(
  {
    ageRange: {
      min: { type: Number },
      max: { type: Number },
    },
    animalType: { type: String },
    characteristics: [{ type: String }],
  },
  { _id: false }
);

const LifestyleSchema = new mongoose.Schema(
  {
    garden: { type: Boolean },
    children: { type: Boolean },
    otherPets: { type: Boolean },
    notes: { type: String },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    birthdate: { type: Date, required: true },
    region: { type: String },
  profileImage: { type: String },
    preferences: { type: PreferencesSchema, default: {} },
    lifestyle: { type: LifestyleSchema, default: {} },
    role: { type: String, enum: ['adopter', 'shelter', 'admin'], default: 'adopter' },
  },
  { timestamps: true }
);

// Remove sensitive/internal fields when converting to JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash; // never expose password hash
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

export default User;
