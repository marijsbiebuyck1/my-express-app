import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;