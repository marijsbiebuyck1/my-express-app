import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import indexRouter from "./routes/index.js";
import asielenRouter from "./routes/asielen.js";

const app = express();
app.set("trust proxy", true);
// Prefer the platform-provided PORT, fall back to ADMIN_PORT then 3002
const PORT = process.env.PORT || process.env.ADMIN_PORT || 3002;

app.use(express.json());
app.use(express.static("public"));

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB (admin)"))
  .catch((err) => console.error("❌ MongoDB connection error (admin):", err));

// Mount routes for admin/shelters
app.use("/", indexRouter); // reuse index router for simple health check or info
app.use("/asielen", asielenRouter);

app.listen(PORT, () => {
  console.log(`🚀 Admin server is running on http://localhost:${PORT}`);
});

export default app;
