import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = express.Router();

// ✅ GET all messages → /messages
router.get('/', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ user: 'Error retrieving users', error });
  }
});

// ✅ GET specific user → /user/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // Check of het een geldig ObjectId is
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ user: 'Invalid user ID' });
  }

  try {
    const user = await User.findById(id);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ user: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ user: 'Error retrieving user', error });
  }
});

// ✅ POST new user → /users
router.post('/', async (req, res) => {
  try {
    const newUser = new User(req.body);
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ user: 'Error adding user', error });
  }
});

// ✅ PUT update user → /user/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ user: 'Invalid user ID' });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (updatedUser) {
      res.json(updatedUser);
    } else {
      res.status(404).json({ user: 'User not found' });
    }
  } catch (error) {
    res.status(400).json({ user: 'Error updating user', error });
  }
});

// ✅ DELETE user → /user/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ user: 'Invalid user ID' });
  }

  try {
    const deletedUser = await User.findByIdAndDelete(id);
    if (deletedUser) {
      res.json({ user: 'User deleted successfully!' });
    } else {
      res.status(404).json({ user: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ user: 'Error deleting user', error });
  }
});



export default router;


