import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    fromKind: { type: String, enum: ['user', 'shelter', 'animal'], required: true },
    fromId: { type: mongoose.Schema.Types.ObjectId, required: true },
    toKind: { type: String, enum: ['user', 'shelter'], required: true },
    toId: { type: mongoose.Schema.Types.ObjectId, required: true },
    animal: { type: mongoose.Schema.Types.ObjectId, ref: 'Animal' },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Message = mongoose.model('Message', messageSchema);
export default Message;
