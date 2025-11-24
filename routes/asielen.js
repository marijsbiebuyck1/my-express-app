import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import path from "path";
import fs from 'fs';
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

// Accept multiple possible file field names used by different frontends
const uploadFieldNames = ['avatar', 'photo', 'image', 'file'];
const uploadFields = upload.fields(uploadFieldNames.map((n) => ({ name: n, maxCount: 1 })));

const getUploadedFileFromReq = (req) => {
  if (req.file) return req.file;
  if (req.files && typeof req.files === 'object') {
    for (const name of uploadFieldNames) {
      if (Array.isArray(req.files[name]) && req.files[name].length > 0) return req.files[name][0];
    }
    if (Array.isArray(req.files) && req.files.length > 0) return req.files[0];
  }
  return null;
};

// Helper to convert stored relative paths into absolute URLs
const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  if (typeof p !== 'string') return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const pathPart = p.startsWith('/') ? p : `/${p}`;
  return `${req.protocol}://${req.get('host')}${pathPart}`;
};

// GET /asielen - list shelters
router.get("/", async (req, res) => {
  try {
    const shelters = await Shelter.find().select("-passwordHash").lean();
    const out = shelters.map((s) => {
      if (s.profileImage) s.profileImage = makeAbsoluteUrl(req, s.profileImage);
      return s;
    });
    res.json(out);
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
    const shelter = await Shelter.findById(id).select("-passwordHash").lean();
    if (!shelter) return res.status(404).json({ message: "Shelter not found" });
    if (shelter.profileImage) shelter.profileImage = makeAbsoluteUrl(req, shelter.profileImage);
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
  // Accept JSON and multipart/form-data (to allow uploading a profile image on create)
  const ct = req.headers && req.headers['content-type'];
  const isMultipart = typeof ct === 'string' && ct.includes('multipart/');

  if (isMultipart) {
    uploadFields(req, res, async (err) => {
      const file = getUploadedFileFromReq(req);
      if (err) {
        console.error('Multer error on shelter create upload:', err);
        const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
        if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
        return res.status(400).json({ message });
      }
        const { name, email,
          password,
        address,
        phone,
        region,
        capacity,
        openingHours,
        contactPerson,
      } = req.body || {};

      if (!name || !email || !password) {
        if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
        return res.status(400).json({ message: 'Missing required fields: name, email, password' });
      }

      try {
        const normalizedEmail = String(email).toLowerCase().trim();
        const existing = await Shelter.findOne({ email: normalizedEmail });
        if (existing) {
          if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
          return res.status(409).json({ message: 'Email already in use' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const shelterDoc = {
          name,
          email: normalizedEmail,
          passwordHash,
          address,
          phone,
          region,
          capacity,
          openingHours,
          contactPerson,
        };

        if (file) shelterDoc.profileImage = `/uploads/${file.filename}`;

        const newShelter = new Shelter(shelterDoc);
        const saved = await newShelter.save();
        const out = saved.toJSON ? saved.toJSON() : saved;
        if (out.profileImage) out.profileImage = makeAbsoluteUrl(req, out.profileImage);
        return res.status(201).json(out);
      } catch (error) {
        console.error('POST /asielen (multipart) error:', error);
        if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
        if (error?.code === 11000) return res.status(409).json({ message: 'Duplicate key', error: error.message });
        return res.status(500).json({ message: 'Error adding shelter', error: error.message || error });
      }
    });
    return;
  }

  // JSON-based create
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
    return res.status(400).json({ message: 'Missing required fields: name, email, password' });

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await Shelter.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: 'Email already in use' });

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
    const out = saved.toJSON ? saved.toJSON() : saved;
    if (out.profileImage) out.profileImage = makeAbsoluteUrl(req, out.profileImage);
    res.status(201).json(out);
  } catch (error) {
    console.error('POST /asielen error:', error);
    if (error?.code === 11000) return res.status(409).json({ message: 'Duplicate key', error: error.message });
    res.status(500).json({ message: 'Error adding shelter', error: error.message || error });
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
  // accept multiple field names and reuse handler
  uploadFields(req, res, async (err) => {
    const file = getUploadedFileFromReq(req);
    if (err) {
      console.error('Multer error on shelter avatar upload:', err);
      const message = err instanceof multer.MulterError ? err.message : err.message || 'Upload error';
      if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
      return res.status(400).json({ message });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
      return res.status(400).json({ message: 'Invalid shelter ID' });
    }
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    try {
      const filePath = `/uploads/${file.filename}`;
      const updated = await Shelter.findByIdAndUpdate(id, { profileImage: filePath }, { new: true }).select('-passwordHash');
      if (!updated) {
        if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
        return res.status(404).json({ message: 'Shelter not found' });
      }
      const out = updated.toJSON ? updated.toJSON() : updated;
      if (out.profileImage) out.profileImage = makeAbsoluteUrl(req, out.profileImage);
      return res.json(out);
    } catch (error) {
      console.error('POST /asielen/:id/avatar error:', error);
      if (file) try { fs.unlinkSync(path.join(uploadDir, file.filename)); } catch (e) {}
      return res.status(500).json({ message: 'Error uploading avatar', error: error.message || error });
    }
  });
});

export default router;
