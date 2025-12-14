import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Shelter from '../models/Shelter.js';

const router = express.Router();

// POST /messages - create a message
// body: { fromKind, fromId, toKind, toId, animal?, text }
router.post('/', async (req, res) => {
	try {
		const { fromKind, fromId, toKind, toId, animal, text } = req.body || {};
		if (!fromKind || !fromId || !toKind || !toId || !text)
			return res.status(400).json({ message: 'Missing required fields' });

		if (!mongoose.Types.ObjectId.isValid(fromId) || !mongoose.Types.ObjectId.isValid(toId))
			return res.status(400).json({ message: 'Invalid fromId or toId' });

		if (animal && !mongoose.Types.ObjectId.isValid(animal))
			return res.status(400).json({ message: 'Invalid animal id' });

		const msg = await Message.create({ fromKind, fromId, toKind, toId, animal, text });
		return res.status(201).json(msg);
	} catch (e) {
		console.error('POST /messages error:', e);
		return res.status(500).json({ message: 'Server error', error: e.message || e });
	}
});

// GET /messages - list messages for participant
// Query params: userId= or shelterId= or animalId=
router.get('/', async (req, res) => {
	try {
		const { userId, shelterId, animalId } = req.query;
		const filter = {};
		if (userId) {
			if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId' });
			filter.$or = [
				{ fromKind: 'user', fromId: userId },
				{ toKind: 'user', toId: userId },
			];
		} else if (shelterId) {
			if (!mongoose.Types.ObjectId.isValid(shelterId)) return res.status(400).json({ message: 'Invalid shelterId' });
			filter.$or = [
				{ fromKind: 'shelter', fromId: shelterId },
				{ toKind: 'shelter', toId: shelterId },
			];
		} else if (animalId) {
			if (!mongoose.Types.ObjectId.isValid(animalId)) return res.status(400).json({ message: 'Invalid animalId' });
			filter.animal = animalId;
		}

		const msgs = await Message.find(filter).sort({ createdAt: -1 }).lean();
		return res.json(msgs);
	} catch (e) {
		console.error('GET /messages error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// GET /messages/:id
router.get('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
		const msg = await Message.findById(id).lean();
		if (!msg) return res.status(404).json({ message: 'Not found' });
		return res.json(msg);
	} catch (e) {
		console.error('GET /messages/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// PATCH /messages/:id - partial update (e.g., mark read)
router.patch('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
		const updated = await Message.findByIdAndUpdate(id, { $set: req.body }, { new: true });
		if (!updated) return res.status(404).json({ message: 'Not found' });
		return res.json(updated);
	} catch (e) {
		console.error('PATCH /messages/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

// DELETE /messages/:id
router.delete('/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
		const doc = await Message.findByIdAndDelete(id);
		if (!doc) return res.status(404).json({ message: 'Not found' });
		return res.json({ success: true });
	} catch (e) {
		console.error('DELETE /messages/:id error:', e);
		return res.status(500).json({ message: 'Server error' });
	}
});

export default router;


