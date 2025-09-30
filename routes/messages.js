import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';

const router = express.Router();

// ✅ GET all messages → /messages
router.get('/', async (req, res) => {
  try {
    const messages = await Message.find().populate("recipients sender");
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving messages', error });
  }
});


// ✅ GET specific message → /message/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // Check of het een geldig ObjectId is
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid message ID' });
  }

  try {
    const message = await Message.findById(id);
    if (message) {
      res.json(message);
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving message', error });
  }
});

// ✅ POST new message → /messages
router.post('/', async (req, res) => {
  try {
    const newMessage = new Message(req.body);
    const savedMessage = await newMessage.save();
    res.status(201).json(savedMessage);
  } catch (error) {
    res.status(400).json({ message: 'Error adding message', error });
  }
});

// ✅ PUT update message → /message/:id
router.put('/message/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid message ID' });
  }

  try {
    const updatedMessage = await Message.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (updatedMessage) {
      res.json(updatedMessage);
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating message', error });
  }
});

// ✅ DELETE message → /message/:id
router.delete('/message/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid message ID' });
  }

  try {
    const deletedMessage = await Message.findByIdAndDelete(id);
    if (deletedMessage) {
      res.json({ message: 'Message deleted successfully!' });
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error });
  }
});



export default router;


