#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node scripts/deleteUsersByIds.js <id1> <id2> ...');
  process.exit(1);
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  // Preview documents that will be deleted
  const found = await mongoose.connection.db
    .collection('users')
    .find({ _id: { $in: objectIds } })
    .project({ _id: 1, email: 1, username: 1, createdAt: 1 })
    .toArray();

  console.log('Found documents to delete:', found.map(d => ({ id: d._id.toString(), email: d.email, username: d.username })));

  if (!found.length) {
    console.log('No matching users found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Confirm via environment override (since this is non-interactive)
  if (process.env.CONFIRM_DELETE !== '1') {
    console.log('Deletion not performed. To actually delete, set CONFIRM_DELETE=1 in your environment and re-run the script.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const res = await mongoose.connection.db.collection('users').deleteMany({ _id: { $in: objectIds } });
  console.log('deletedCount:', res.deletedCount);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
