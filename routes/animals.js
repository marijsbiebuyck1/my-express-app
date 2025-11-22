import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import multer from 'multer';
import Animal from '../models/Animal.js';
import Shelter from '../models/Shelter.js';

const router = express.Router();

// Multer setup — save to project public/uploads and restrict to images
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadDir),
	filename: (req, file, cb) => {
		const safe = file.originalname.replace(/[^a-z0-9.\-\_\.]/gi, '_');
		cb(null, `${Date.now()}-${safe}`);
	},
});

const fileFilter = (req, file, cb) => {
	const allowed = ['image/jpeg', 'image/png', 'image/webp'];
	if (allowed.includes(file.mimetype)) cb(null, true);
	else cb(new Error('Only image files (jpeg, png, webp) are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

const makeAbsoluteUrl = (req, p) => {
	if (!p) return p;
	if (typeof p !== 'string') return p;
	if (p.startsWith('http://') || p.startsWith('https://')) return p;
	const pathPart = p.startsWith('/') ? p : `/${p}`;
	return `${req.protocol}://${req.get('host')}${pathPart}`;
};

// POST /animals — create animal (multipart/form-data)
// Accept multiple file field names client-side may use (photo, image, avatar, file)
// Also accept shelterId aliases (shelterId, shelterID, shelterid)
router.post('/', (req, res) => {
	const fields = upload.fields([
		{ name: 'photo', maxCount: 1 },
		{ name: 'image', maxCount: 1 },
		{ name: 'avatar', maxCount: 1 },
		{ name: 'file', maxCount: 1 },
	]);
	fields(req, res, async (err) => {
		if (err) {
			console.error('Multer error on animal upload:', err);
			const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
			return res.status(400).json({ message });
		}

		// DEBUG: log incoming multipart fields and files to help diagnose missing fields
		console.log('POST /animals received body:', req.body);
		console.log('POST /animals received files:', req.files);

		try {
			// Accept file from multiple possible field names
			let file = null;
			if (req.file) file = req.file;
			if (!file && req.files) {
				file = (req.files.photo && req.files.photo[0]) ||
					(req.files.image && req.files.image[0]) ||
					(req.files.avatar && req.files.avatar[0]) ||
					(req.files.file && req.files.file[0]) || null;
			}
			if (!file) return res.status(400).json({ message: 'Photo is required' });

			// accept shelterId aliases from different clients
			const { name, birthdate, attributes } = req.body || {};
			const shelterId = req.body?.shelterId ?? req.body?.shelterID ?? req.body?.shelterid;
			if (!name || !birthdate || !shelterId) return res.status(400).json({ message: 'name, birthdate and shelterId are required' });

			if (!mongoose.Types.ObjectId.isValid(shelterId)) return res.status(400).json({ message: 'Invalid shelterId' });

			// optional attributes as JSON string
			let parsedAttributes = {};
			if (attributes) {
				try {
					parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
				} catch (e) {
					return res.status(400).json({ message: 'attributes must be valid JSON' });
				}
			}

			// verify shelter exists (so uploading from profile makes sense)
			const shelter = await Shelter.findById(shelterId).select('-passwordHash');
			if (!shelter) return res.status(404).json({ message: 'Shelter not found' });

			const filePath = `/uploads/${file.filename}`;

			const animal = await Animal.create({
				shelter: shelter._id,
				name,
				birthdate: new Date(birthdate),
				photo: filePath,
				attributes: parsedAttributes,
			});

			const obj = animal.toJSON ? animal.toJSON() : animal;
			obj.photo = makeAbsoluteUrl(req, obj.photo);
			return res.status(201).json(obj);
		} catch (e) {
			console.error('POST /animals error:', e);
			return res.status(500).json({ message: 'Server error', error: e.message || e });
		}
	});
});

// GET /animals — list animals (optional ?shelterId=&page=&limit=)
router.get('/', async (req, res) => {
	try {
		const { shelterId, page = 1, limit = 50 } = req.query;
		const l = Math.min(parseInt(limit, 10) || 50, 200);
		const p = Math.max(parseInt(page, 10) || 1, 1);

		const filter = {};
		if (shelterId && mongoose.Types.ObjectId.isValid(shelterId)) filter.shelter = shelterId;

		const animals = await Animal.find(filter)
			.sort({ createdAt: -1 })
			.skip((p - 1) * l)
			.limit(l)
			.populate('shelter', 'name profileImage')
			.lean();
		const out = animals.map((a) => {
			if (a.photo) a.photo = makeAbsoluteUrl(req, a.photo);
			if (a.shelter && a.shelter.profileImage) a.shelter.profileImage = makeAbsoluteUrl(req, a.shelter.profileImage);
			return a;
		});
		return res.json(out);
	} catch (e) {
		console.error('GET /animals error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// GET /animals/:id
router.get('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
	const animal = await Animal.findById(id).populate('shelter', 'name profileImage');
	if (!animal) return res.status(404).json({ message: 'Not found' });
	const obj = animal.toJSON ? animal.toJSON() : animal;
	if (obj.photo) obj.photo = makeAbsoluteUrl(req, obj.photo);
	if (obj.shelter && obj.shelter.profileImage) obj.shelter.profileImage = makeAbsoluteUrl(req, obj.shelter.profileImage);
	return res.json(obj);
	} catch (e) {
		console.error('GET /animals/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// PATCH /animals/:id — partial update (e.g., attributes)
router.patch('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

		const update = {};
		if (req.body.name !== undefined) update.name = req.body.name;
		if (req.body.birthdate !== undefined) update.birthdate = new Date(req.body.birthdate);
		if (req.body.attributes !== undefined) update.attributes = req.body.attributes;
		if (Object.keys(update).length === 0) return res.status(400).json({ message: 'No valid fields to update' });

		const updated = await Animal.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
		if (!updated) return res.status(404).json({ message: 'Not found' });
		return res.json(updated);
	} catch (e) {
		console.error('PATCH /animals/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// DELETE /animals/:id
router.delete('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
		const animal = await Animal.findByIdAndDelete(id);
		if (!animal) return res.status(404).json({ message: 'Not found' });
		// NOTE: file on disk is not removed here — could be added later
		return res.json({ success: true });
	} catch (e) {
		console.error('DELETE /animals/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

export default router;

