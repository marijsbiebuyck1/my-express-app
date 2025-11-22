import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Post from '../models/Post.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const POST_ID = process.argv[2];
const USER_ID = process.argv[3];

if (!MONGO_URI) {
  console.error('MONGO_URI is required in environment (.env)');
  process.exit(1);
}
if (!POST_ID || !USER_ID) {
  console.error('Usage: node scripts/assign-post-author.js <POST_ID> <USER_ID>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const post = await Post.findById(POST_ID);
  if (!post) {
    console.error('Post not found:', POST_ID);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('Before:', { id: post._id.toString(), author: post.author });

  post.author = USER_ID;
  await post.save();

  console.log('Updated post author to', USER_ID);
  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
