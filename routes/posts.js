import express from "express";
import path from "path";
import fs from "fs";
import Post from "../models/Post.js";
import User from "../models/User.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// uploads directory (used when decoding base64 data-URLs)
const uploadDir = path.join(process.cwd(), "public", "uploads");

// Helper to convert stored relative paths into absolute URLs
const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  return p;
};

// Create a post (JSON): either provide { filename } referring to /public/uploads
// or { image: 'data:image/...;base64,...' } which will be decoded and saved.
// Require authentication: author will be taken from the token (req.user.id)
router.post("/", auth, async (req, res) => {
  let file = null;
  try {
    const { image, filename, caption } = req.body || {};

    if (image && typeof image === "string" && image.startsWith("data:")) {
      const matches = image.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );
      if (!matches)
        return res.status(400).json({ error: "Invalid image data URL" });
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
        .json({ error: "Image is required (filename or data URL)" });
    }

    const imagePath = `/uploads/${file.filename}`; // served from /public

    // Use authenticated user as author
    if (!req.user || !req.user.id) {
      try {
        if (file) await fs.promises.unlink(path.join(uploadDir, file.filename));
      } catch (e) {}
      return res.status(401).json({ error: "Authentication required" });
    }

    const post = await Post.create({
      image: imagePath,
      caption,
      author: req.user.id,
    });

    // populate author (name + profileImage) for the response
    const populated = await Post.findById(post._id)
      .populate("author", "name profileImage")
      .lean();
    if (populated) {
      populated.image = makeAbsoluteUrl(req, populated.image);
      if (populated.author) {
        populated.author.profileImage = makeAbsoluteUrl(
          req,
          populated.author.profileImage
        );
        // ensure author.id exists and remove internal _id if lean returned it
        if (populated.author._id) {
          populated.author.id = populated.author._id.toString();
          delete populated.author._id;
        }
      }
    }

    return res.status(201).json(populated || post);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get all posts (paginated optional)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("author", "name profileImage")
      .lean();

    const out = posts.map((p) => {
      const copy = { ...p };
      copy.image = makeAbsoluteUrl(req, copy.image);
      if (copy.author) {
        copy.author.profileImage = makeAbsoluteUrl(
          req,
          copy.author.profileImage
        );
        if (copy.author._id) {
          copy.author.id = copy.author._id.toString();
          delete copy.author._id;
        }
      } else {
        // ensure author object exists in response even if DB post had no author
        copy.author = { id: null, name: "Onbekend", profileImage: null };
      }
      return copy;
    });
    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get single post
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "author",
      "name profileImage"
    );
    if (!post) return res.status(404).json({ error: "Not found" });
    const postObj = post.toJSON ? post.toJSON() : post;
    postObj.image = makeAbsoluteUrl(req, postObj.image);
    if (postObj.author) {
      postObj.author.profileImage = makeAbsoluteUrl(
        req,
        postObj.author.profileImage
      );
    }
    return res.json(postObj);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Delete post (optional)
router.delete("/:id", async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
