import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },
    conversationKey: { type: String, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deviceKey: { type: String, index: true },
    animal: { type: mongoose.Schema.Types.ObjectId, ref: "Animal" },
    fromKind: {
      type: String,
      enum: ["user", "shelter", "animal", "system"],
    },
    fromId: { type: mongoose.Schema.Types.ObjectId },
    toKind: { type: String, enum: ["user", "shelter", "animal"] },
    toId: { type: mongoose.Schema.Types.ObjectId },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    authorDisplayName: { type: String },
  },
  { timestamps: true }
);

messageSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Message = mongoose.model("Message", messageSchema);
export default Message;
