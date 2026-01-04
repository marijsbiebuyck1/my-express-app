import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Animal from '../models/Animal.js';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in the environment. Aborting.');
    process.exit(2);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const countBefore = await Animal.countDocuments();
    console.log(`Found ${countBefore} animal(s) in the database.`);
    if (countBefore === 0) {
      console.log('Nothing to delete. Exiting.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Final confirmation check: require exact env var DELETE_ALL_ANIMALS_CONFIRM === 'YES'
    if (process.env.DELETE_ALL_ANIMALS_CONFIRM !== 'YES') {
      console.error('Environment variable DELETE_ALL_ANIMALS_CONFIRM !== "YES". To proceed, set DELETE_ALL_ANIMALS_CONFIRM=YES in your environment and re-run the script. Aborting.');
      await mongoose.disconnect();
      process.exit(3);
    }

    const result = await Animal.deleteMany({});
    console.log(`Deleted ${result.deletedCount ?? 0} animal(s).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error while deleting animals:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
