import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
// multer removed per request — profile uploads handled via JSON (filename or base64 data URL)
import User from "../models/User.js";

const router = express.Router();

// directory for uploads (still used when saving base64 uploads)
const uploadDir = path.join(process.cwd(), "public", "uploads");

// Helper to make stored relative paths (e.g. /uploads/xxx.jpg) into absolute URLs
const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  if (typeof p !== "string") return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  // ensure leading slash
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${req.protocol}://${req.get("host")}${pathPart}`;
};

const formatUserResponse = (req, data) => {
  if (!data) return data;
  return data;
};
// GET /users — list users (without passwordHash)
router.get("/", async (req, res) => {
  console.log("GET /users called");
  try {
    const users = await User.find().select("-passwordHash");
    console.log(
      "GET /users result count:",
      Array.isArray(users) ? users.length : typeof users
    );
    res.json(formatUserResponse(req, users));
  } catch (error) {
    console.error("GET /users error:", error);
    if (error && error.stack) console.error(error.stack);
    res.status(500).json({
      message: "Error retrieving users",
      error: error.message || error,
    });
  }
});

// GET /users/:id — single user
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(formatUserResponse(req, user));
  } catch (error) {
    console.error("GET /users/:id error:", error);
    res.status(500).json({
      message: "Error retrieving user",
      error: error.message || error,
    });
  }
});

// POST /users — create user (expects password, will be hashed)
// Note: multer/multipart removed — registration accepts JSON only
router.post("/", async (req, res) => {
  const {
    name,
    email,
    password,
    birthdate,
    region,
    preferences,
    lifestyle,
    role,
  } = req.body || {};

  if (!name || !email || !password || !birthdate) {
    return res.status(400).json({
      message: "Missing required fields: name, email, password, birthdate",
    });
  }

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing)
      return res.status(409).json({ message: "Email already in use" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email: normalizedEmail,
      passwordHash,
      birthdate,
      region,
      preferences,
      lifestyle,
      role,
    });

    const saved = await newUser.save();
    res.status(201).json(formatUserResponse(req, saved));
  } catch (error) {
    console.error("POST /users error:", error);
    if (error?.code === 11000)
      return res
        .status(409)
        .json({ message: "Duplicate key", error: error.message });
    res
      .status(500)
      .json({ message: "Error adding user", error: error.message || error });
  }
});

// POST /users/login — authenticate user with email + password
router.post("/login", async (req, res) => {
  // JSON-based login (default)
  console.log("POST /users/login json handler: req.body=", req.body);
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
      return res.status(401).json({ message: "Invalid email or password" });

    const safeUser = user.toJSON ? user.toJSON() : user;
    const SECRET = process.env.JWT_SECRET || "dev-secret-change-this";
    const token = jwt.sign(
      { id: user._id.toString(), name: user.name },
      SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      message: "Login successful",
      token,
      user: formatUserResponse(req, safeUser),
    });
  } catch (error) {
    console.error("POST /users/login error:", error);
    res
      .status(500)
      .json({ message: "Error during login", error: error.message || error });
  }
});

// GET /users/:id/preferences - get user's preferences
router.get("/:id/preferences", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    const user = await User.findById(id).select("preferences");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.preferences || {});
  } catch (error) {
    console.error("GET /users/:id/preferences error:", error);
    res.status(500).json({
      message: "Error retrieving preferences",
      error: error.message || error,
    });
  }
});

// GET /users/:id/interests - get user's interests/profile selections
router.get("/:id/interests", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    const user = await User.findById(id).select("interests");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.interests || {});
  } catch (error) {
    console.error("GET /users/:id/interests error:", error);
    res.status(500).json({
      message: "Error retrieving interests",
      error: error.message || error,
    });
  }
});

// PATCH /users/:id/interests - update user's interests
router.patch("/:id/interests", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    const updated = await User.findByIdAndUpdate(
      id,
      { interests: req.body },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(formatUserResponse(req, updated));
  } catch (error) {
    console.error("PATCH /users/:id/interests error:", error);
    res.status(400).json({
      message: "Error updating interests",
      error: error.message || error,
    });
  }
});

// GET /users/:id/home - get user's home situation
router.get("/:id/home", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    const user = await User.findById(id).select("home");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.home || {});
  } catch (error) {
    console.error("GET /users/:id/home error:", error);
    res.status(500).json({
      message: "Error retrieving home info",
      error: error.message || error,
    });
  }
});

// PATCH /users/:id/home - update user's home situation
router.patch("/:id/home", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    const updated = await User.findByIdAndUpdate(
      id,
      { home: req.body },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(formatUserResponse(req, updated));
  } catch (error) {
    console.error("PATCH /users/:id/home error:", error);
    res.status(400).json({
      message: "Error updating home info",
      error: error.message || error,
    });
  }
});

// PATCH /users/:id/profile - update multiple profile sections at once
// Accepts any of { preferences, interests, home } in the body and updates only provided sections
router.patch("/:id/profile", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  const { preferences, interests, home } = req.body || {};
  const update = {};

  if (preferences !== undefined) update.preferences = preferences;
  if (interests !== undefined) update.interests = interests;
  if (home !== undefined) update.home = home;

  if (Object.keys(update).length === 0)
    return res
      .status(400)
      .json({ message: "No profile fields provided to update" });

  try {
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(formatUserResponse(req, updated));
  } catch (error) {
    console.error("PATCH /users/:id/profile error:", error);
    res.status(400).json({
      message: "Error updating profile",
      error: error.message || error,
    });
  }
});

// PATCH /users/:id/preferences - update user's preferences
router.patch("/:id/preferences", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user ID" });

  try {
    // Replace or set preferences object
    const updated = await User.findByIdAndUpdate(
      id,
      { preferences: req.body },
      { new: true, runValidators: true }
    ).select("-passwordHash");

    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(formatUserResponse(req, updated));
  } catch (error) {
    console.error("PATCH /users/:id/preferences error:", error);
    res.status(400).json({
      message: "Error updating preferences",
      error: error.message || error,
    });
  }
});

// POST /users/:id/avatar and /users/:id/photo — upload profile image
// multer removed: accept JSON with either { filename } (already uploaded to /public/uploads)
// or { profileImage: 'data:image/...;base64,...' } (base64 data URL) which will be decoded and saved.
const profileUploadHandler = async (req, res) => {
  const { id } = req.params;

  const profileImage = req.body.profileImage;

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.profileImage = profileImage;
  await user.save();
  res.json(formatUserResponse(req, user));
};

router.post("/:id/avatar", profileUploadHandler);
router.post("/:id/photo", profileUploadHandler);

export default router;
