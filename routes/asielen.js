import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import path from "path";
import multer from "multer";
import Shelter from "../models/Shelter.js";

const router = express.Router();

// Multer setup for local uploads (reuse same public/uploads)
const uploadDir = path.join(process.cwd(), "public", "uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9.\-\_\.]/gi, "_");
    const filename = `${Date.now()}-${safeName}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files (jpeg, png, webp) are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// GET /asielen - list shelters
router.get("/", async (req, res) => {
  try {
    const shelters = await Shelter.find().select("-passwordHash");
    res.json(shelters);
  } catch (error) {
    console.error("GET /asielen error:", error);
    res
      .status(500)
      .json({
        message: "Error retrieving shelters",
        error: error.message || error,
      });
  }
});

// GET /asielen/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid shelter ID" });
  try {
    const shelter = await Shelter.findById(id).select("-passwordHash");
    if (!shelter) return res.status(404).json({ message: "Shelter not found" });
    res.json(shelter);
  } catch (error) {
    console.error("GET /asielen/:id error:", error);
    res
      .status(500)
      .json({
        message: "Error retrieving shelter",
        error: error.message || error,
      });
  }
});

// POST /asielen - create shelter
router.post("/", async (req, res) => {
  const {
    name,
    email,
    password,
    address,
    phone,
    region,
    capacity,
    openingHours,
    contactPerson,
  } = req.body || {};

  if (!name || !email || !password)
    return res
      .status(400)
      .json({ message: "Missing required fields: name, email, password" });

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await Shelter.findOne({ email: normalizedEmail });
    if (existing)
      return res.status(409).json({ message: "Email already in use" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newShelter = new Shelter({
      name,
      email: normalizedEmail,
      passwordHash,
      address,
      phone,
      region,
      capacity,
      openingHours,
      contactPerson,
    });

    const saved = await newShelter.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("POST /asielen error:", error);
    if (error?.code === 11000)
      return res
        .status(409)
        .json({ message: "Duplicate key", error: error.message });
    res
      .status(500)
      .json({ message: "Error adding shelter", error: error.message || error });
  }
});

// PATCH /asielen/:id - general update (partial)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid shelter ID" });
  try {
    const updated = await Shelter.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!updated) return res.status(404).json({ message: "Shelter not found" });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /asielen/:id error:", error);
    res
      .status(400)
      .json({
        message: "Error updating shelter",
        error: error.message || error,
      });
  }
});

// POST /asielen/:id/avatar - upload profile image
router.post("/:id/avatar", (req, res) => {
  const singleUpload = upload.single("avatar");
  singleUpload(req, res, async (err) => {
    if (err) {
      console.error("Multer error on shelter avatar upload:", err);
      const message =
        err instanceof multer.MulterError
          ? err.message
          : err.message || "Upload error";
      return res.status(400).json({ message });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid shelter ID" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
      const filePath = `/uploads/${req.file.filename}`;
      const updated = await Shelter.findByIdAndUpdate(
        id,
        { profileImage: filePath },
        { new: true }
      ).select("-passwordHash");
      if (!updated)
        return res.status(404).json({ message: "Shelter not found" });
      res.json(updated);
    } catch (error) {
      console.error("POST /asielen/:id/avatar error:", error);
      res
        .status(500)
        .json({
          message: "Error uploading avatar",
          error: error.message || error,
        });
    }
  });
});

export default router;
