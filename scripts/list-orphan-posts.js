import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Post from '../models/Post.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || process.argv[2];
if (!MONGO_URI) {
  console.error('MONGO_URI required as env var or first arg');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const filter = { $or: [{ author: { $exists: false } }, { author: null }] };
  const posts = await Post.find(filter).limit(100).lean();
  console.log(`Found ${posts.length} orphan post(s). Showing up to 100:`);
  posts.forEach((p) => {
    console.log({ id: p._id.toString(), caption: p.caption, image: p.image, createdAt: p.createdAt });
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
