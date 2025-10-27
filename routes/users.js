import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import multer from 'multer';
import User from '../models/User.js';

const router = express.Router();

// Multer setup for local uploads
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadDir),
	filename: (req, file, cb) => {
		const safeName = file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_');
		const filename = `${Date.now()}-${safeName}`;
		cb(null, filename);
	},
});

const fileFilter = (req, file, cb) => {
	const allowed = ['image/jpeg', 'image/png', 'image/webp'];
	if (allowed.includes(file.mimetype)) cb(null, true);
	else cb(new Error('Only image files (jpeg, png, webp) are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

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

	// POST /users/:id/avatar — upload profile image (multipart/form-data 'avatar' field)
	router.post('/:id/avatar', (req, res) => {
		// Use multer manually here so we can handle Multer errors and return clean JSON
		const singleUpload = upload.single('avatar');
		singleUpload(req, res, async (err) => {
			if (err) {
				// Multer error (file too large, unexpected field, etc.)
				console.error('Multer error on avatar upload:', err);
				const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
				return res.status(400).json({ message });
			}

			const { id } = req.params;
			if (!mongoose.Types.ObjectId.isValid(id)) {
				return res.status(400).json({ message: 'Invalid user ID' });
			}

			if (!req.file) {
				return res.status(400).json({ message: 'No file uploaded' });
			}

			try {
				// Save relative URL to the file (served from /uploads/...)
				const filePath = `/uploads/${req.file.filename}`;
				const updated = await User.findByIdAndUpdate(id, { profileImage: filePath }, { new: true }).select('-passwordHash');
				if (!updated) return res.status(404).json({ message: 'User not found' });
				res.json(updated);
			} catch (error) {
				console.error('POST /users/:id/avatar error:', error);
				res.status(500).json({ message: 'Error uploading avatar', error: error.message || error });
			}
		});
	});

export default router;


