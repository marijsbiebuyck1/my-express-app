import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import Animal from "../models/Animal.js";
import Shelter from "../models/Shelter.js";

const router = express.Router();

// uploads directory (used when decoding base64 data-URLs)
const uploadDir = path.join(process.cwd(), "public", "uploads");

const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  if (typeof p !== "string") return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${req.protocol}://${req.get("host")}${pathPart}`;
};

// POST /animals — create animal
// Accept either { filename } referring to /public/uploads or { image: 'data:...;base64,...' }
// Also accept shelterId aliases (shelterId, shelterID, shelterid)
router.post("/", async (req, res) => {
  let file = null;
  try {
    const { image, filename, name, birthdate, attributes, description } =
      req.body || {};
    const normalizedDescription =
      typeof description === "string" ? description.trim() : "";
    const shelterId =
      req.body?.shelterId ?? req.body?.shelterID ?? req.body?.shelterid;

    if (!name || !birthdate || !shelterId)
      return res
        .status(400)
        .json({ message: "name, birthdate and shelterId are required" });
    if (!mongoose.Types.ObjectId.isValid(shelterId))
      return res.status(400).json({ message: "Invalid shelterId" });

    // parse attributes if provided as string
    let parsedAttributes = {};
    if (attributes) {
      try {
        parsedAttributes =
          typeof attributes === "string" ? JSON.parse(attributes) : attributes;
      } catch (e) {
        return res
          .status(400)
          .json({ message: "attributes must be valid JSON" });
      }
    }

    if (image && typeof image === "string" && image.startsWith("data:")) {
      const matches = image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );
      if (!matches)
        return res.status(400).json({ message: "Invalid image data URL" });
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
        .json({ message: "Photo is required (filename or data URL)" });
    }

    const shelter = await Shelter.findById(shelterId).select("-passwordHash");
    if (!shelter) {
      if (file)
        try {
          fs.unlinkSync(path.join(uploadDir, file.filename));
        } catch (e) {}
      return res.status(404).json({ message: "Shelter not found" });
    }

    const filePath = `/uploads/${file.filename}`;

    const animal = await Animal.create({
      shelter: shelter._id,
      name,
      birthdate: new Date(birthdate),
      photo: filePath,
      description: normalizedDescription,
      attributes: parsedAttributes,
    });

    const obj = animal.toJSON ? animal.toJSON() : animal;
    obj.photo = makeAbsoluteUrl(req, obj.photo);
    return res.status(201).json(obj);
  } catch (e) {
    console.error("POST /animals error:", e);
    return res
      .status(500)
      .json({ message: "Server error", error: e.message || e });
  }
});

// GET /animals — list animals (optional ?shelterId=&page=&limit=)
router.get("/", async (req, res) => {
  try {
    const { shelterId, page = 1, limit = 50 } = req.query;
    const l = Math.min(parseInt(limit, 10) || 50, 200);
    const p = Math.max(parseInt(page, 10) || 1, 1);

    const filter = {};
    if (shelterId && mongoose.Types.ObjectId.isValid(shelterId))
      filter.shelter = shelterId;

    const animals = await Animal.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate("shelter", "name profileImage")
      .lean();
    const out = animals.map((a) => {
      if (typeof a.description !== "string") a.description = "";
      if (a.photo) a.photo = makeAbsoluteUrl(req, a.photo);
      if (a.shelter && a.shelter.profileImage)
        a.shelter.profileImage = makeAbsoluteUrl(req, a.shelter.profileImage);
      return a;
    });
    return res.json(out);
  } catch (e) {
    console.error("GET /animals error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /animals/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });
    const animal = await Animal.findById(id).populate(
      "shelter",
      "name profileImage"
    );
    if (!animal) return res.status(404).json({ message: "Not found" });
    const obj = animal.toJSON ? animal.toJSON() : animal;
    if (typeof obj.description !== "string") obj.description = "";
    if (obj.photo) obj.photo = makeAbsoluteUrl(req, obj.photo);
    if (obj.shelter && obj.shelter.profileImage)
      obj.shelter.profileImage = makeAbsoluteUrl(req, obj.shelter.profileImage);
    return res.json(obj);
  } catch (e) {
    console.error("GET /animals/:id error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// PATCH /animals/:id — partial update (e.g., attributes)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.birthdate !== undefined)
      update.birthdate = new Date(req.body.birthdate);

    if (req.body.attributes !== undefined) {
      try {
        update.attributes =
          typeof req.body.attributes === "string"
            ? JSON.parse(req.body.attributes)
            : req.body.attributes;
      } catch (err) {
        return res
          .status(400)
          .json({ message: "attributes must be valid JSON" });
      }
    }

    if (req.body.description !== undefined)
      update.description =
        typeof req.body.description === "string"
          ? req.body.description.trim()
          : "";

    if (req.body.status !== undefined) update.status = req.body.status;

    if (
      req.body.image &&
      typeof req.body.image === "string" &&
      req.body.image.startsWith("data:")
    ) {
      const matches = req.body.image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );
      if (!matches)
        return res.status(400).json({ message: "Invalid image data URL" });
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
      update.photo = `/uploads/${genFilename}`;
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ message: "No valid fields to update" });

    const updated = await Animal.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Not found" });
    const obj = updated.toJSON ? updated.toJSON() : updated;
    if (obj.photo) obj.photo = makeAbsoluteUrl(req, obj.photo);
    return res.json(obj);
  } catch (e) {
    console.error("PATCH /animals/:id error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /animals/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });
    const animal = await Animal.findByIdAndDelete(id);
    if (!animal) return res.status(404).json({ message: "Not found" });
    // NOTE: file on disk is not removed here — could be added later
    return res.json({ success: true });
  } catch (e) {
    console.error("DELETE /animals/:id error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /animals - destructive: delete ALL animals
// Protection: requires header `x-delete-confirm: DELETE_ALL_ANIMALS_NOW`.
// In production an admin token must also be provided via `x-admin-delete-token` matching
// the env var ADMIN_DELETE_TOKEN. In non-production the confirmation header alone is allowed.
router.delete("/", async (req, res) => {
  try {
    const confirm = req.get("x-delete-confirm") || req.query.confirm;
    if (confirm !== "DELETE_ALL_ANIMALS_NOW") {
      return res.status(400).json({
        message: "Missing or invalid delete confirmation header/query",
      });
    }

    const adminTokenEnv = process.env.ADMIN_DELETE_TOKEN;
    const providedAdmin = req.get("x-admin-delete-token");
    if (process.env.NODE_ENV === "production") {
      if (!adminTokenEnv || adminTokenEnv !== providedAdmin) {
        return res
          .status(403)
          .json({ message: "Forbidden: admin token required in production" });
      }
    }

    // list animals, remove local photo files if present, then delete documents
    const animals = await Animal.find().lean();
    const count = animals.length;

    for (const a of animals) {
      try {
        if (a.photo && typeof a.photo === "string") {
          const rel = a.photo.startsWith("/") ? a.photo.slice(1) : a.photo;
          const fp = path.join(process.cwd(), "public", rel);
          if (fs.existsSync(fp)) {
            try {
              fs.unlinkSync(fp);
            } catch (e) {
              /* ignore file delete errors */
            }
          }
        }
      } catch (e) {
        /* ignore per-item errors */
      }
    }

    const result = await Animal.deleteMany({});
    return res.json({ success: true, deleted: result.deletedCount ?? count });
  } catch (e) {
    console.error("DELETE /animals (all) error:", e);
    return res
      .status(500)
      .json({ message: "Server error", error: e.message || e });
  }
});

export default router;
