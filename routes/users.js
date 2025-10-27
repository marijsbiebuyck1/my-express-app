import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = express.Router();

// GET /users — list users (without passwordHash)
router.get('/', async (req, res) => {
	console.log('GET /users called');
	try {
		const users = await User.find().select('-passwordHash');
		console.log('GET /users result count:', Array.isArray(users) ? users.length : typeof users);
		res.json(users);
	} catch (error) {
		console.error('GET /users error:', error);
		if (error && error.stack) console.error(error.stack);
		res.status(500).json({ message: 'Error retrieving users', error: error.message || error });
	}
});

// GET /users/:id — single user
router.get('/:id', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ message: 'Invalid user ID' });
	}

	try {
		const user = await User.findById(id).select('-passwordHash');
		if (!user) return res.status(404).json({ message: 'User not found' });
		res.json(user);
	} catch (error) {
		console.error('GET /users/:id error:', error);
		res.status(500).json({ message: 'Error retrieving user', error: error.message || error });
	}
});

// POST /users — create user (expects password, will be hashed)
router.post('/', async (req, res) => {
	const { name, email, password, birthdate, region, preferences, lifestyle, role } = req.body || {};

	if (!name || !email || !password || !birthdate) {
		return res.status(400).json({ message: 'Missing required fields: name, email, password, birthdate' });
	}

	try {
		const normalizedEmail = String(email).toLowerCase().trim();
		const existing = await User.findOne({ email: normalizedEmail });
		if (existing) return res.status(409).json({ message: 'Email already in use' });

		const salt = await bcrypt.genSalt(10);
		const passwordHash = await bcrypt.hash(password, salt);

		const newUser = new User({
			name,
			email: normalizedEmail,
			passwordHash,
			birthdate,
			region,
			preferences,
			lifestyle,
			role,
		});

		const saved = await newUser.save();
		res.status(201).json(saved);
	} catch (error) {
		console.error('POST /users error:', error);
		if (error?.code === 11000) return res.status(409).json({ message: 'Duplicate key', error: error.message });
		res.status(500).json({ message: 'Error adding user', error: error.message || error });
	}
});

export default router;


