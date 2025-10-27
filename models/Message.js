import mongoose from 'mongoose';

// Message schema for chat functionality
const messageSchema = new mongoose.Schema(
  {
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
    // senderId can be a user id (string/objectid) or the literal 'system'
    senderId: { type: String, required: true },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ['system', 'user', 'form_request', 'form_response', 'appointment_invite'],
      default: 'user',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

messageSchema.index({ matchId: 1, createdAt: 1 });

messageSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export default mongoose.models.Message || mongoose.model('Message', messageSchema);