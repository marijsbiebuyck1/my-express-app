import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import indexRouter from "./routes/index.js";
import dataRouter from "./routes/data.js";
import userRouter from "./routes/users.js";
import messagesRouter from "./routes/messages.js";
import postsRouter from "./routes/posts.js";
import asielenRouter from "./routes/asielen.js";
import animalsRouter from "./routes/animals.js";
import uploadsRouter from "./routes/uploads.js";
import fs from "fs";
import path from "path";

const app = express();
// Behind Render/other proxies we have to trust the proxy so req.protocol reflects HTTPS
app.set("trust proxy", true);
const PORT = process.env.PORT || 3001;

// Middleware
// Increase body size limits so frontend can send base64 image data URLs as JSON
app.use(express.json({ limit: "10mb" })); // Use JSON as global data format
// Also accept URL-encoded bodies (useful for HTML forms or clients that send profileImage as a text field)
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("public")); // Make public folder accessible

// Ensure uploads directory exists (useful for deployed environments)
try {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Ensured uploads directory exists at", uploadsDir);
} catch (err) {
  console.warn("⚠️ Could not ensure uploads directory:", err?.message || err);
}

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/", indexRouter);
app.use("/api/data", dataRouter);
app.use("/users", userRouter);
app.use("/messages", messagesRouter);
app.use("/posts", postsRouter);
app.use("/asielen", asielenRouter);
app.use("/animals", animalsRouter);
app.use("/uploads", uploadsRouter);
// pets routes removed — implement later if needed

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
