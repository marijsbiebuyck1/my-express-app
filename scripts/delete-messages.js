import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Message from '../models/Message.js';

async function main() {
	const doDelete = process.argv.includes('--yes') || process.argv.includes('-y');

	console.log('Connecting to MongoDB...');
	await mongoose.connect(process.env.MONGO_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	try {
		const count = await Message.countDocuments();
		console.log(`Found ${count} message(s) in the database.`);

		if (count === 0) {
			console.log('No messages to delete.');
			await mongoose.disconnect();
			return;
		}

		if (!doDelete) {
			console.log('Dry run: no messages were deleted.');
			console.log('To delete all messages, re-run with --yes (or -y).');
			await mongoose.disconnect();
			return;
		}

		const res = await Message.deleteMany({});
		console.log(`Deleted ${res.deletedCount ?? res.n ?? 'unknown'} message(s).`);
	} catch (err) {
		console.error('Error deleting messages:', err);
	} finally {
		await mongoose.disconnect();
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});

