import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import Shelter from "../models/Shelter.js";

const router = express.Router();

// uploads directory (used when decoding base64 data-URLs)
const uploadDir = path.join(process.cwd(), "public", "uploads");

// Helper to convert stored relative paths into absolute URLs
const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  if (typeof p !== "string") return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${req.protocol}://${req.get("host")}${pathPart}`;
};

const formatShelterResponse = (req, payload) => {
  if (!payload) return payload;
  const base =
    typeof payload.toJSON === "function" ? payload.toJSON() : { ...payload };
  const out = { ...base };
  if (out.profileImage)
    out.profileImage = makeAbsoluteUrl(req, out.profileImage);
  return out;
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
    res.status(500).json({
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
    if (shelter.profileImage)
      shelter.profileImage = makeAbsoluteUrl(req, shelter.profileImage);
    res.json(shelter);
  } catch (error) {
    console.error("GET /asielen/:id error:", error);
    res.status(500).json({
      message: "Error retrieving shelter",
      error: error.message || error,
    });
  }
});
// POST /asielen - create shelter
router.post("/", async (req, res) => {
  // Accept JSON and multipart/form-data (to allow uploading a profile image on create)
  const ct = req.headers && req.headers["content-type"];
  const isMultipart = typeof ct === "string" && ct.includes("multipart/");

  if (isMultipart) {
    // multer removed — accept JSON only for create
    return res
      .status(400)
      .json({
        message:
          "Multipart/form-data not supported. Send JSON (use profileImage data URL or filename).",
      });
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
    const out = saved.toJSON ? saved.toJSON() : saved;
    if (out.profileImage)
      out.profileImage = makeAbsoluteUrl(req, out.profileImage);
    res.status(201).json(out);
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
    res.status(400).json({
      message: "Error updating shelter",
      error: error.message || error,
    });
  }
});

// POST /asielen/:id/avatar - upload profile image
router.post("/:id/avatar", (req, res) => {
  // accept JSON body with { filename } or { profileImage: dataURL }
  (async () => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid shelter ID" });

    let file = null;
    try {
      const { profileImage, filename } = req.body || {};
      if (
        profileImage &&
        typeof profileImage === "string" &&
        profileImage.startsWith("data:")
      ) {
        const matches = profileImage.match(
          /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );
        if (!matches)
          return res.status(400).json({ message: "Invalid data URL" });
        const mime = matches[1];
        const base64 = matches[2];
        const ext = mime.includes("png")
          ? ".png"
          : mime.includes("webp")
          ? ".webp"
          : ".jpg";
        const genFilename = `${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${ext}`;
        const absPath = path.join(uploadDir, genFilename);
        await fs.promises.writeFile(absPath, Buffer.from(base64, "base64"));
        file = { filename: genFilename };
      } else if (filename && typeof filename === "string") {
        file = { filename: path.basename(filename) };
      } else {
        return res
          .status(400)
          .json({
            message:
              "No file provided; send { filename } or { profileImage: dataURL } in JSON body",
          });
      }

      try {
        const filePath = `/uploads/${file.filename}`;
        const updated = await Shelter.findByIdAndUpdate(
          id,
          { profileImage: filePath },
          { new: true }
        ).select("-passwordHash");
        if (!updated) {
          if (file)
            try {
              fs.unlinkSync(path.join(uploadDir, file.filename));
            } catch (e) {}
          return res.status(404).json({ message: "Shelter not found" });
        }
        const out = updated.toJSON ? updated.toJSON() : updated;
        if (out.profileImage)
          out.profileImage = makeAbsoluteUrl(req, out.profileImage);
        return res.json(out);
      } catch (error) {
        console.error("POST /asielen/:id/avatar error:", error);
        if (file)
          try {
            fs.unlinkSync(path.join(uploadDir, file.filename));
          } catch (e) {}
        return res
          .status(500)
          .json({
            message: "Error uploading avatar",
            error: error.message || error,
          });
      }
    } catch (err) {
      console.error("Profile upload handler error:", err);
      if (file)
        try {
          fs.unlinkSync(path.join(uploadDir, file.filename));
        } catch (e) {}
      return res
        .status(500)
        .json({ message: "Unexpected error", error: err.message || err });
    }
  })();
});

// POST /asielen/login — authenticate shelters/admins
router.post("/login", async (req, res) => {
  const body = req.body || {};
  const rawEmail =
    body.email || body.username || body.contactEmail || body.login;
  const rawPassword = body.password || body.pass || body.secret;

  if (!rawEmail || !rawPassword) {
    return res
      .status(400)
      .json({ message: "Email en wachtwoord zijn verplicht" });
  }

  try {
    const normalizedEmail = String(rawEmail).toLowerCase().trim();
    const password = String(rawPassword);
    const shelter = await Shelter.findOne({ email: normalizedEmail });

    if (!shelter) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, shelter.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const SECRET =
      process.env.ADMIN_JWT_SECRET ||
      process.env.JWT_SECRET ||
      "dev-secret-change-this";
    const token = jwt.sign(
      {
        id: shelter._id.toString(),
        role: shelter.role || "shelter",
        type: "shelter",
      },
      SECRET,
      { expiresIn: "7d" }
    );

    const safeShelter = formatShelterResponse(req, shelter);
    res.json({ message: "Login successful", token, shelter: safeShelter });
  } catch (error) {
    console.error("POST /asielen/login error:", error);
    res.status(500).json({
      message: "Error during login",
      error: error.message || error,
    });
  }
});

export default router;
