import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
// Register models so populate works
import '../models/User.js';
import Post from '../models/Post.js';

async function main() {
  const ids = process.argv.slice(2);
  if (!ids || ids.length === 0) {
    console.error('Usage: node scripts/deletePostsByIds.js <id1> <id2> ...');
    process.exit(2);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    for (const id of ids) {
      try {
        const post = await Post.findById(id).populate('author', 'name');
        if (!post) {
          console.log(`No post found with id ${id}`);
          continue;
        }
        console.log('Found post to delete:');
        console.log({ id: post._id.toString(), title: post.title ?? null, text: post.text ?? null, author: post.author ? { id: post.author._id.toString(), name: post.author.name } : null, createdAt: post.createdAt });
        const deleted = await Post.findByIdAndDelete(id);
        if (deleted) {
          console.log(`Deleted post ${id}`);
        } else {
          console.log(`Failed to delete post ${id} (it may have been removed concurrently)`);
        }
      } catch (err) {
        console.error(`Error deleting ${id}:`, err.message || err);
      }
    }

    const remaining = await Post.countDocuments();
    console.log(`Remaining posts after deletion: ${remaining}`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
