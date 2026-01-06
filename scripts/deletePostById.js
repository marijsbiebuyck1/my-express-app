import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Post from '../models/Post.js';

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/deletePostById.js <postId>');
    process.exit(2);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const post = await Post.findById(id).populate('author', 'name profileImage');
    if (!post) {
      console.log(`No post found with id ${id}`);
      await mongoose.disconnect();
      return;
    }

    console.log('Found post:');
    console.log({
      id: post._id.toString(),
      title: post.title ?? null,
      text: post.text ?? null,
      author: post.author ? { id: post.author._id.toString(), name: post.author.name, profileImage: post.author.profileImage } : null,
      createdAt: post.createdAt,
    });

    const deleted = await Post.findByIdAndDelete(id);
    if (!deleted) {
      console.log('Deletion failed — post no longer exists.');
      await mongoose.disconnect();
      return;
    }

    const remaining = await Post.countDocuments();
    console.log(`Deleted post ${id}. Remaining posts: ${remaining}`);
  } catch (err) {
    console.error('Error deleting post:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
