import express from "express";
import fs from "fs";
import path from "path";
const router = express.Router();

// GET /uploads/  -> return a JSON list of uploaded files (URLs)
router.get("/", (req, res) => {
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const files = fs.readdirSync(uploadsDir).filter((f) => f[0] !== ".");
    const urls = files.map((f) => `/uploads/${encodeURIComponent(f)}`);
    res.json({ files: urls });
  } catch (err) {
    res.status(500).json({ error: "Could not read uploads directory" });
  }
});

export default router;
