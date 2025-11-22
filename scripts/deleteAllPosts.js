import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Post from '../models/Post.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const count = await Post.countDocuments();
    console.log(`Found ${count} post(s) in the database.`);

    if (count === 0) {
      console.log('No posts to delete.');
      await mongoose.disconnect();
      return;
    }

    const res = await Post.deleteMany({});
    console.log(`Deleted ${res.deletedCount ?? res.n ?? 'unknown'} post(s).`);
  } catch (err) {
    console.error('Error deleting posts:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
