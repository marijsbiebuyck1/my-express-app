import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import indexRouter from './routes/index.js';
import dataRouter from './routes/data.js';
import userRouter from './routes/users.js';



const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json()); // Use JSON as global data format
app.use(express.static('public')); // Make public folder accessible

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
// pets routes removed — implement later if needed

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});