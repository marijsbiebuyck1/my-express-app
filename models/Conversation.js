import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deviceKey: { type: String, index: true },
    animal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Animal",
      required: true,
    },
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
    },
    animalName: { type: String },
    animalPhoto: { type: String },
    matchedAt: { type: Date, default: Date.now },
    autoMessageSent: { type: Boolean, default: false },
    lastMessage: { type: String },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

conversationSchema.index(
  { user: 1, animal: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $exists: true, $ne: null } },
  }
);
conversationSchema.index(
  { deviceKey: 1, animal: 1 },
  {
    unique: true,
    partialFilterExpression: { deviceKey: { $exists: true, $ne: null } },
  }
);

conversationSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    if (ret.user) ret.userId = ret.user?.toString();
    if (ret.animal) ret.animalId = ret.animal?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
