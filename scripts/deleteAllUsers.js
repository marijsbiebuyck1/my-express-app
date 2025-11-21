import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.js';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in environment. Aborting.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const count = await User.countDocuments();
    console.log(`Found ${count} user(s) in the database.`);
    if (count === 0) {
      console.log('No users to delete. Exiting.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Proceed to delete all users
    const res = await User.deleteMany({});
    console.log(`Deleted ${res.deletedCount} user(s).`);
  } catch (err) {
    console.error('Error while deleting users:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
