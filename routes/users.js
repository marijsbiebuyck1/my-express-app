import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
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

// Accept multiple possible file field names used by different frontends
const uploadFieldNames = ['avatar', 'photo', 'image', 'file'];
const uploadFields = upload.fields(uploadFieldNames.map((n) => ({ name: n, maxCount: 1 })));

const getUploadedFileFromReq = (req) => {
	// multer puts single files in req.file (for single) or req.files (object) for fields/any
	if (req.file) return req.file;
	if (req.files && typeof req.files === 'object') {
		for (const name of uploadFieldNames) {
			if (Array.isArray(req.files[name]) && req.files[name].length > 0) return req.files[name][0];
		}
		// if req.files is an array (upload.any), pick first
		if (Array.isArray(req.files) && req.files.length > 0) return req.files[0];
	}
	return null;
};

// Helper to make stored relative paths (e.g. /uploads/xxx.jpg) into absolute URLs
const makeAbsoluteUrl = (req, p) => {
	if (!p) return p;
	if (typeof p !== 'string') return p;
	if (p.startsWith('http://') || p.startsWith('https://')) return p;
	// ensure leading slash
	const pathPart = p.startsWith('/') ? p : `/${p}`;
	return `${req.protocol}://${req.get('host')}${pathPart}`;
};

const formatUserResponse = (req, data) => {
	if (!data) return data;
	const toObj = (u) => {
		// u may already be a plain object or a mongoose doc
		const obj = u && typeof u.toJSON === 'function' ? u.toJSON() : { ...u };
		if (obj && obj.profileImage) obj.profileImage = makeAbsoluteUrl(req, obj.profileImage);
		return obj;
	};
	if (Array.isArray(data)) return data.map(toObj);
	return toObj(data);
};
// GET /users — list users (without passwordHash)
router.get('/', async (req, res) => {
	console.log('GET /users called');
	try {
		const users = await User.find().select('-passwordHash');
		console.log('GET /users result count:', Array.isArray(users) ? users.length : typeof users);
		res.json(formatUserResponse(req, users));
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
		res.json(formatUserResponse(req, user));
	} catch (error) {
		console.error('GET /users/:id error:', error);
		res.status(500).json({ message: 'Error retrieving user', error: error.message || error });
	}
});

// POST /users — create user (expects password, will be hashed)
router.post('/', async (req, res) => {
	// Accept both JSON and multipart/form-data (so a photo can be uploaded at registration)
	const ct = req.headers && req.headers['content-type'];
	const isMultipart = typeof ct === 'string' && ct.includes('multipart/');

		if (isMultipart) {
			uploadFields(req, res, async (err) => {
				if (err) {
					console.error('Multer error on register upload:', err);
					const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
					return res.status(400).json({ message });
				}

				const { name, email, password, birthdate, region, preferences, lifestyle, role } = req.body || {};
				const file = getUploadedFileFromReq(req);
				if (!name || !email || !password || !birthdate) {
					if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
					return res.status(400).json({ message: 'Missing required fields: name, email, password, birthdate' });
				}

				try {
					const normalizedEmail = String(email).toLowerCase().trim();
					const existing = await User.findOne({ email: normalizedEmail });
					if (existing) {
						if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
						return res.status(409).json({ message: 'Email already in use' });
					}

					const salt = await bcrypt.genSalt(10);
					const passwordHash = await bcrypt.hash(password, salt);

					const userDoc = {
						name,
						email: normalizedEmail,
						passwordHash,
						birthdate: new Date(birthdate),
						region,
						preferences,
						lifestyle,
						role,
					};

					if (file) {
						userDoc.profileImage = `/uploads/${file.filename}`;
					}

					const newUser = new User(userDoc);
					const saved = await newUser.save();
					return res.status(201).json(formatUserResponse(req, saved));
				} catch (error) {
					console.error('POST /users (multipart) error:', error);
					if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
					if (error?.code === 11000) return res.status(409).json({ message: 'Duplicate key', error: error.message });
					return res.status(500).json({ message: 'Error adding user', error: error.message || error });
				}
			});
			return;
		}

	// JSON-based registration (default)
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
		res.status(201).json(formatUserResponse(req, saved));
	} catch (error) {
		console.error('POST /users error:', error);
		if (error?.code === 11000) return res.status(409).json({ message: 'Duplicate key', error: error.message });
		res.status(500).json({ message: 'Error adding user', error: error.message || error });
	}
});

// POST /users/login — authenticate user with email + password
router.post('/login', async (req, res) => {
	// Log content-type for debugging
	const ct = req.headers && req.headers['content-type'];
	console.log('POST /users/login content-type:', ct);

	const isMultipart = typeof ct === 'string' && ct.includes('multipart/');

		if (isMultipart) {
			uploadFields(req, res, async (err) => {
				const file = getUploadedFileFromReq(req);
				console.log('POST /users/login multipart handler: file=', file, ' body=', req.body);
				if (err) {
					console.error('Multer error on login upload:', err);
					const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
					return res.status(400).json({ message });
				}

				const { email, password } = req.body || {};
				if (!email || !password) {
					if (file) {
						try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
					}
					return res.status(400).json({ message: 'Email and password are required' });
				}

				try {
					const normalizedEmail = String(email).toLowerCase().trim();
					const user = await User.findOne({ email: normalizedEmail });
					if (!user) {
						if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
						return res.status(401).json({ message: 'Invalid email or password' });
					}

					const ok = await bcrypt.compare(password, user.passwordHash);
					if (!ok) {
						if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
						return res.status(401).json({ message: 'Invalid email or password' });
					}

					if (file) {
						const filePath = `/uploads/${file.filename}`;
						const updated = await User.findByIdAndUpdate(user._id, { profileImage: filePath }, { new: true }).select('-passwordHash');
						const safeUser = updated ? updated.toJSON() : user.toJSON();
						return res.json({ message: 'Login successful', user: formatUserResponse(req, safeUser) });
					}

					const safeUser = user.toJSON ? user.toJSON() : user;
					return res.json({ message: 'Login successful', user: formatUserResponse(req, safeUser) });
				} catch (error) {
					console.error('POST /users/login (multipart) error:', error);
					if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
					return res.status(500).json({ message: 'Error during login', error: error.message || error });
				}
			});
			return;
		}

	// JSON-based login (default)
	console.log('POST /users/login json handler: req.body=', req.body);
	const { email, password } = req.body || {};

	if (!email || !password) {
		return res.status(400).json({ message: 'Email and password are required' });
	}

	try {
		const normalizedEmail = String(email).toLowerCase().trim();
		const user = await User.findOne({ email: normalizedEmail });

		if (!user) {
			return res.status(401).json({ message: 'Invalid email or password' });
		}

		const ok = await bcrypt.compare(password, user.passwordHash);
		if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

		const safeUser = user.toJSON ? user.toJSON() : user;
		res.json({ message: 'Login successful', user: formatUserResponse(req, safeUser) });
	} catch (error) {
		console.error('POST /users/login error:', error);
		res.status(500).json({ message: 'Error during login', error: error.message || error });
	}
});

// GET /users/:id/preferences - get user's preferences
router.get('/:id/preferences', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		const user = await User.findById(id).select('preferences');
		if (!user) return res.status(404).json({ message: 'User not found' });
		res.json(user.preferences || {});
	} catch (error) {
		console.error('GET /users/:id/preferences error:', error);
		res.status(500).json({ message: 'Error retrieving preferences', error: error.message || error });
	}
});

// GET /users/:id/interests - get user's interests/profile selections
router.get('/:id/interests', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		const user = await User.findById(id).select('interests');
		if (!user) return res.status(404).json({ message: 'User not found' });
		res.json(user.interests || {});
	} catch (error) {
		console.error('GET /users/:id/interests error:', error);
		res.status(500).json({ message: 'Error retrieving interests', error: error.message || error });
	}
});

// PATCH /users/:id/interests - update user's interests
router.patch('/:id/interests', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		const updated = await User.findByIdAndUpdate(id, { interests: req.body }, { new: true, runValidators: true }).select('-passwordHash');
		if (!updated) return res.status(404).json({ message: 'User not found' });
		res.json(formatUserResponse(req, updated));
	} catch (error) {
		console.error('PATCH /users/:id/interests error:', error);
		res.status(400).json({ message: 'Error updating interests', error: error.message || error });
	}
});

// GET /users/:id/home - get user's home situation
router.get('/:id/home', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		const user = await User.findById(id).select('home');
		if (!user) return res.status(404).json({ message: 'User not found' });
		res.json(user.home || {});
	} catch (error) {
		console.error('GET /users/:id/home error:', error);
		res.status(500).json({ message: 'Error retrieving home info', error: error.message || error });
	}
});

// PATCH /users/:id/home - update user's home situation
router.patch('/:id/home', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		const updated = await User.findByIdAndUpdate(id, { home: req.body }, { new: true, runValidators: true }).select('-passwordHash');
		if (!updated) return res.status(404).json({ message: 'User not found' });
		res.json(formatUserResponse(req, updated));
	} catch (error) {
		console.error('PATCH /users/:id/home error:', error);
		res.status(400).json({ message: 'Error updating home info', error: error.message || error });
	}
});

// PATCH /users/:id/profile - update multiple profile sections at once
// Accepts any of { preferences, interests, home } in the body and updates only provided sections
router.patch('/:id/profile', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

		const { preferences, interests, home } = req.body || {};
		const update = {};

	if (preferences !== undefined) update.preferences = preferences;
	if (interests !== undefined) update.interests = interests;
	if (home !== undefined) update.home = home;

	if (Object.keys(update).length === 0) return res.status(400).json({ message: 'No profile fields provided to update' });

	try {
		const updated = await User.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).select('-passwordHash');
		if (!updated) return res.status(404).json({ message: 'User not found' });
		res.json(formatUserResponse(req, updated));
	} catch (error) {
		console.error('PATCH /users/:id/profile error:', error);
		res.status(400).json({ message: 'Error updating profile', error: error.message || error });
	}
});

// PATCH /users/:id/preferences - update user's preferences
router.patch('/:id/preferences', async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID' });

	try {
		// Replace or set preferences object
		const updated = await User.findByIdAndUpdate(
			id,
			{ preferences: req.body },
			{ new: true, runValidators: true }
		).select('-passwordHash');

		if (!updated) return res.status(404).json({ message: 'User not found' });
		res.json(formatUserResponse(req, updated));
	} catch (error) {
		console.error('PATCH /users/:id/preferences error:', error);
		res.status(400).json({ message: 'Error updating preferences', error: error.message || error });
	}
});

	// POST /users/:id/avatar and /users/:id/photo — upload profile image (accepts multiple field names)
	const profileUploadHandler = (req, res) => {
		uploadFields(req, res, async (err) => {
			const file = getUploadedFileFromReq(req);
			if (err) {
				console.error('Multer error on profile upload:', err);
				const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
				return res.status(400).json({ message });
			}

			const { id } = req.params;
			if (!mongoose.Types.ObjectId.isValid(id)) {
				if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
				return res.status(400).json({ message: 'Invalid user ID' });
			}

			if (!file) {
				return res.status(400).json({ message: 'No file uploaded' });
			}

			try {
				const filePath = `/uploads/${file.filename}`;
				const updated = await User.findByIdAndUpdate(id, { profileImage: filePath }, { new: true }).select('-passwordHash');
				if (!updated) {
					if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
					return res.status(404).json({ message: 'User not found' });
				}
				return res.json(formatUserResponse(req, updated));
			} catch (error) {
				console.error('POST /users/:id/profile upload error:', error);
				if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
				return res.status(500).json({ message: 'Error uploading profile image', error: error.message || error });
			}
		});
	};

	router.post('/:id/avatar', profileUploadHandler);
	router.post('/:id/photo', profileUploadHandler);

export default router;


