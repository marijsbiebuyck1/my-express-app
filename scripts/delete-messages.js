#!/usr/bin/env node
import mongoose from 'mongoose';
import Message from '../models/Message.js';

async function main() {
  const argv = process.argv.slice(2);
  const maybeUri = process.env.MONGO_URI || argv[0];
  if (!maybeUri) {
    console.error("Missing MONGO_URI. Usage: MONGO_URI='...' node scripts/delete-messages.js [--yes]");
    process.exit(1);
  }

  const uri = maybeUri;
  console.log('Connecting to Mongo...');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const total = await Message.countDocuments();
    console.log(`Messages total: ${total}`);

    const sample = await Message.find().limit(10).lean();
    console.log('Sample (up to 10):');
    console.log(JSON.stringify(sample, null, 2));

    const confirmed = process.env.CONFIRM === '1' || argv.includes('--yes') || argv.includes('-y');
    if (!confirmed) {
      console.log('\nDry run only. To actually delete run with CONFIRM=1 or --yes:');
      console.log("  CONFIRM=1 MONGO_URI=\"<uri>\" node scripts/delete-messages.js");
      console.log('  OR');
      console.log('  MONGO_URI="<uri>" node scripts/delete-messages.js --yes');
      process.exit(0);
    }

    console.log('Deleting messages...');
    const res = await Message.deleteMany({});
    console.log(`Deleted ${res.deletedCount} messages.`);
  } catch (err) {
    console.error('Error:', err && (err.stack || err.message || err));
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
