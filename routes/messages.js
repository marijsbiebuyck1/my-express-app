import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/message.js';

const router = express.Router();

// GET /messages?matchId=...  -> chat history for a match
router.get('/', async (req, res) => {
  try {
    const { matchId } = req.query;
    if (!matchId) return res.status(400).json({ message: 'matchId query parameter is required' });
    if (!mongoose.Types.ObjectId.isValid(matchId)) return res.status(400).json({ message: 'Invalid matchId' });

    const messages = await Message.find({ matchId: new mongoose.Types.ObjectId(matchId) }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('GET /messages error:', error);
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
});

// POST /messages -> create new message
router.post('/', async (req, res) => {
  try {
    const { matchId, senderId, text, type } = req.body || {};
    if (!matchId) return res.status(400).json({ message: 'matchId is required' });
    if (!senderId) return res.status(400).json({ message: 'senderId is required' });
    if (!text) return res.status(400).json({ message: 'text is required' });

    if (!mongoose.Types.ObjectId.isValid(matchId)) return res.status(400).json({ message: 'Invalid matchId' });

    const payload = {
      matchId: new mongoose.Types.ObjectId(matchId),
      senderId: String(senderId),
      text: String(text),
    };
    if (type) payload.type = type;

    const created = await Message.create(payload);
    res.status(201).json(created);
  } catch (error) {
    console.error('POST /messages error:', error);
    res.status(400).json({ message: 'Error creating message', error: error.message });
  }
});

// DELETE /messages/:id - optional moderation delete
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid message id' });

    const deleted = await Message.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Message deleted', id });
  } catch (error) {
    console.error('DELETE /messages/:id error:', error);
    res.status(500).json({ message: 'Error deleting message', error: error.message });
  }
});

export default router;
