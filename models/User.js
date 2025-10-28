import mongoose from 'mongoose';

const PreferencesSchema = new mongoose.Schema(
  {
    preferredSpecies: [{ type: String }],
    ageRange: {
      min: { type: Number },
      max: { type: Number },
    },
    animalType: { type: String },
    characteristics: [{ type: String }],
    traits: [{ type: String }],
    regions: [{ type: String }],
    notes: { type: String },
  },
  { _id: false }
);

const LifestyleSchema = new mongoose.Schema(
  {
    garden: { type: Boolean },
    // children can be detailed (none | under6 | 6to14 | 14plus)
    children: { type: String, enum: ['none', 'under6', '6to14', '14plus'] },
    // otherPets lists types present at home (e.g. ['cat','dog','rodent'])
    otherPets: [{ type: String }],
    notes: { type: String },
  },
  { _id: false }
);

const InterestsSchema = new mongoose.Schema(
  {
    employmentStatus: { type: String, enum: ['working', 'student', 'retired', 'other'] },
    employmentLabels: [{ type: String }], // e.g. telewerk, vaak reizen, 9-to-5
    freeTime: [{ type: String }], // e.g. wandelen, vakantie, series, drinken, sporten
    experience: { type: String, enum: ['yes', 'no', 'some'] },
    householdCompanions: [{ type: String }], // gezin, alleen, partner, roomies
  },
  { _id: false }
);

const HomeSchema = new mongoose.Schema(
  {
    garden: { type: Boolean },
    otherPets: [{ type: String }],
    children: { type: String, enum: ['none', 'under6', '6to14', '14plus'] },
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
    interests: { type: InterestsSchema, default: {} },
    home: { type: HomeSchema, default: {} },
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
