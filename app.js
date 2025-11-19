import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import indexRouter from './routes/index.js';
import dataRouter from './routes/data.js';
import userRouter from './routes/users.js';
import messagesRouter from './routes/messages.js';
import postsRouter from './routes/posts.js';
import asielenRouter from './routes/asielen.js';
import animalsRouter from './routes/animals.js';
import fs from 'fs';
import path from 'path';



const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json()); // Use JSON as global data format
app.use(express.static('public')); // Make public folder accessible

// Ensure uploads directory exists (useful for deployed environments)
try {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Ensured uploads directory exists at', uploadsDir);
} catch (err) {
  console.warn('⚠️ Could not ensure uploads directory:', err?.message || err);
}

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/', indexRouter);
app.use('/api/data', dataRouter);
app.use('/users', userRouter);
app.use('/messages', messagesRouter);
app.use('/posts', postsRouter);
app.use('/asielen', asielenRouter);
app.use('/animals', animalsRouter);
// pets routes removed — implement later if needed

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});