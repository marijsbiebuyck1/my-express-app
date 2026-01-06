import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
// Ensure User model is registered before populating references
import '../models/User.js';
import Post from '../models/Post.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('author', 'name profileImage')
      .lean();

    if (!posts || posts.length === 0) {
      console.log('No posts found.');
      await mongoose.disconnect();
      return;
    }

    console.log(`Showing ${posts.length} most recent post(s):`);
    posts.forEach((p) => {
      console.log('---');
      console.log(`id: ${p._id}`);
      console.log(`title: ${p.title ?? ''}`);
      console.log(`text: ${p.text ?? ''}`);
      console.log(`author: ${p.author ? `${p.author._id} (${p.author.name})` : 'null'}`);
      console.log(`likes: ${p.likes ?? 0}`);
      console.log(`createdAt: ${p.createdAt}`);
    });
  } catch (err) {
    console.error('Error listing posts:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
