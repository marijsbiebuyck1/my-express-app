import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import Animal from "../models/Animal.js";
import Shelter from "../models/Shelter.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

const router = express.Router();

// uploads directory (used when decoding base64 data-URLs)
const uploadDir = path.join(process.cwd(), "public", "uploads");

const resolveProtocol = (req) => {
  const forwarded = req.get("x-forwarded-proto");
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.protocol || "http";
};

const makeAbsoluteUrl = (req, p) => {
  return p;
};

const buildConversationKey = (conversation, userId) => {
  if (conversation?.user || userId) {
    const uid = conversation?.user?.toString?.() || userId?.toString?.();
    return `${uid}:${conversation.animal?.toString?.()}`;
  }
  if (conversation?.deviceKey) {
    return `device:${
      conversation.deviceKey
    }:${conversation.animal?.toString?.()}`;
  }
  if (conversation?.shelter) {
    return `shelter:${conversation.shelter.toString?.()}:${conversation.animal?.toString?.()}`;
  }
  return conversation?._id?.toString?.();
};

async function ensureMatchConversation(animal, user) {
  const baseUpdate = {
    user: user._id,
    animal: animal._id,
    animalName: animal.name,
    animalPhoto: animal.photo || null,
    shelter: animal.shelter || null,
  };

  const conversation = await Conversation.findOneAndUpdate(
    { user: user._id, animal: animal._id },
    { $set: baseUpdate, $setOnInsert: { matchedAt: new Date() } },
    { new: true, upsert: true }
  );
  return conversation;
}

// POST /animals — create animal
// Accept optional { filename } referring to /public/uploads or optional { image: 'data:...;base64,...' }
// Description is required. Also accept shelterId aliases (shelterId, shelterID, shelterid)
router.post("/", async (req, res) => {
  let file = null;
  try {
    const { image, filename, name, birthdate, attributes, description } =
      req.body || {};
    const normalizedDescription =
      typeof description === "string" ? description.trim() : "";
    const shelterId =
      req.body?.shelterId ?? req.body?.shelterID ?? req.body?.shelterid;

    // Require name, birthdate, shelterId and a non-empty description
    if (!name || !birthdate || !shelterId || !normalizedDescription)
      return res.status(400).json({
        message: "name, birthdate, shelterId and description are required",
      });
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

    // validate a few new attribute fields if present
    if (parsedAttributes) {
      if (parsedAttributes.childrenCompatibility) {
        const allowed = ["no", "younger_than_6", "6_to_14", "14_plus"];
        if (!allowed.includes(parsedAttributes.childrenCompatibility)) {
          return res
            .status(400)
            .json({ message: "Invalid childrenCompatibility value" });
        }
      }
      if (parsedAttributes.catType) {
        const allowedCatTypes = ["indoor", "outdoor", "cuddle", "farm"];
        if (!allowedCatTypes.includes(parsedAttributes.catType)) {
          return res.status(400).json({ message: "Invalid catType value" });
        }
      }
      if (
        parsedAttributes.otherAnimals &&
        !Array.isArray(parsedAttributes.otherAnimals)
      ) {
        return res
          .status(400)
          .json({ message: "otherAnimals must be an array" });
      }
      if (parsedAttributes.gardenAccess !== undefined) {
        parsedAttributes.gardenAccess = Boolean(parsedAttributes.gardenAccess);
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
    }

    const shelter = await Shelter.findById(shelterId).select("-passwordHash");
    if (!shelter) {
      if (file)
        try {
          fs.unlinkSync(path.join(uploadDir, file.filename));
        } catch (e) {}
      return res.status(404).json({ message: "Shelter not found" });
    }

    const filePath = file ? `/uploads/${file.filename}` : undefined;

    const createData = {
      shelter: shelter._id,
      name,
      birthdate: new Date(birthdate),
      description: normalizedDescription,
      attributes: parsedAttributes,
      photo: image,
    };

    const animal = await Animal.create(createData);

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
      // validate fields in update.attributes similar to create
      const parsedAttributes = update.attributes || {};
      if (parsedAttributes.childrenCompatibility) {
        const allowed = ["no", "younger_than_6", "6_to_14", "14_plus"];
        if (!allowed.includes(parsedAttributes.childrenCompatibility)) {
          return res
            .status(400)
            .json({ message: "Invalid childrenCompatibility value" });
        }
      }
      if (parsedAttributes.catType) {
        const allowedCatTypes = ["indoor", "outdoor", "cuddle", "farm"];
        if (!allowedCatTypes.includes(parsedAttributes.catType)) {
          return res.status(400).json({ message: "Invalid catType value" });
        }
      }
      if (
        parsedAttributes.otherAnimals &&
        !Array.isArray(parsedAttributes.otherAnimals)
      ) {
        return res
          .status(400)
          .json({ message: "otherAnimals must be an array" });
      }
      if (parsedAttributes.gardenAccess !== undefined) {
        parsedAttributes.gardenAccess = Boolean(parsedAttributes.gardenAccess);
      }
      update.attributes = parsedAttributes;
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

// POST /animals/:id/match - register a match between a user and an animal
// When a match is created, the animal sends a message to the user saying "dit is een match"
router.post("/:id/match", async (req, res) => {
  try {
    const { id } = req.params; // animal id
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid animal id" });
    const animal = await Animal.findById(id).lean();
    if (!animal) return res.status(404).json({ message: "Animal not found" });

    // Accept userId in body or use req.user.id if available
    const userId = req.body?.userId || (req.user && req.user.id);
    if (!userId)
      return res
        .status(400)
        .json({ message: "userId required to register match" });
    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: "Invalid userId" });
    const user = await User.findById(userId).select("-passwordHash").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // Build token sets for user preferences and animal attributes
    const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : null);
    const pushIf = (arr, v) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach((x) => x && arr.push(norm(x)));
      else arr.push(norm(v));
    };

    const userTokens = [];
    // preferences: preferredSpecies, characteristics, traits
    const prefs = user.preferences || {};
    pushIf(userTokens, prefs.preferredSpecies || []);
    pushIf(userTokens, prefs.characteristics || []);
    pushIf(userTokens, prefs.traits || []);

    // animal tokens
    const animalTokens = [];
    const attrs = animal.attributes || {};
    pushIf(animalTokens, attrs.species);
    pushIf(animalTokens, attrs.breed);
    pushIf(animalTokens, attrs.size);
    pushIf(animalTokens, attrs.characteristics || []);
    pushIf(animalTokens, attrs.traits || []);

    // Remove nulls and duplicates
    const clean = (arr) =>
      Array.from(
        new Set(arr.filter((x) => typeof x === "string" && x.length > 0))
      );
    const aTokens = clean(animalTokens);
    const uTokens = clean(userTokens);

    // compute Jaccard similarity
    const intersect = aTokens.filter((t) => uTokens.includes(t)).length;
    const unionCount = Math.max(1, new Set([...aTokens, ...uTokens]).size);
    const similarity = intersect / unionCount;

    // threshold 0.9 (90%)
    const threshold = 0.9;
    if (similarity < threshold) {
      return res.status(200).json({ match: false, similarity });
    }

    const conversation = await ensureMatchConversation(animal, user);
    const msg = await Message.create({
      conversation: conversation._id,
      conversationKey: buildConversationKey(conversation, user._id),
      user: user._id,
      animal: animal._id,
      shelter: animal.shelter || undefined,
      fromKind: "animal",
      fromId: animal._id,
      toKind: "user",
      toId: user._id,
      text: "dit is een match",
      authorDisplayName: animal.name,
    });

    conversation.lastMessage = msg.text;
    conversation.lastMessageAt = msg.createdAt;
    if (!conversation.matchedAt) {
      conversation.matchedAt = msg.createdAt;
    }
    await conversation.save();

    return res.status(201).json({
      match: true,
      similarity,
      message: msg,
      conversation,
    });
  } catch (e) {
    console.error("POST /animals/:id/match error:", e);
    return res
      .status(500)
      .json({ message: "Server error", error: e.message || e });
  }
});
