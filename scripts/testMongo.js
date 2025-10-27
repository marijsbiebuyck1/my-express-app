import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('❌ MONGO_URI is not set in environment');
  process.exit(1);
}

console.log('Testing MongoDB connection using MONGO_URI from .env...');

mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ Connected to MongoDB (test)');
    return mongoose.disconnect();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });
