import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Post from '../models/Post.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const AUTHOR_ID = process.env.AUTHOR_ID || process.argv[2];

if (!MONGO_URI) {
  console.error('MONGO_URI is required in environment (.env)');
  process.exit(1);
}
if (!AUTHOR_ID) {
  console.error('AUTHOR_ID is required as env var or first CLI arg');
  console.error('Usage: AUTHOR_ID=<userId> node scripts/backfill-post-authors.js');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const filter = { $or: [{ author: { $exists: false } }, { author: null }] };
  const posts = await Post.find(filter).lean();
  console.log(`Found ${posts.length} post(s) without an author.`);
  if (posts.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Show a few example ids so you can sanity-check
  console.log('Example post ids:', posts.slice(0, 5).map((p) => p._id.toString()));

  const { acknowledged, modifiedCount } = await Post.updateMany(filter, { $set: { author: AUTHOR_ID } });
  console.log('updateMany result:', { acknowledged, modifiedCount });

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
