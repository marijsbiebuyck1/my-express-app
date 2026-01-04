import express from "express";
import mongoose from "mongoose";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Debug helper: return the authenticated user as seen by the middleware
router.get('/whoami', auth, (req, res) => {
  return res.json({ user: req.user || null });
});

// Create a post: accepts { image: 'data:image/...;base64,...', caption }
// Image data is stored directly on the document (similar to user.profileImage).
// Require authentication: author will be taken from the token (req.user.id)
router.post("/", auth, async (req, res) => {
  try {
    const { image, caption } = req.body || {};

    if (
      !image ||
      typeof image !== "string" ||
      !image.trim().toLowerCase().startsWith("data:image")
    ) {
      return res
        .status(400)
        .json({ error: "Image data URL (data:image/...) is required" });
    }

    const imageData = image.trim();

    // Ensure we use the authenticated user as the author. Don't trust any author in the request body.
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Determine authenticated user id from middleware (token lookup)
    const rawAuthor = req.user?.id || req.user?._id || (req.user?._doc && (req.user._doc.id || req.user._doc._id));
    if (!rawAuthor) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const authorId = String(rawAuthor);

    // Debug log to help trace which user is used server-side
    console.log("POST /posts - authenticated user:", { authorId, headerXUserId: req.get("x-user-id") });

    // Create post with the authenticated user as author (always trust server-side identity)
    const created = await Post.create({
      image: imageData,
      caption,
      author: mongoose.Types.ObjectId(authorId),
    });

    // Defensive: ensure author is exactly the authenticated user (in case of hooks/overrides)
    const post = await Post.findByIdAndUpdate(
      created._id,
      { $set: { author: mongoose.Types.ObjectId(authorId) } },
      { new: true }
    );

    // populate author (name + profileImage) for the response
    const populated = await Post.findById(post._id)
      .populate("author", "name profileImage")
      .lean();
    if (populated && populated.author && populated.author._id) {
      populated.author.id = populated.author._id.toString();
      delete populated.author._id;
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
      if (copy.author) {
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
    if (postObj.author) {
      if (postObj.author._id) {
        postObj.author.id = postObj.author._id.toString();
        delete postObj.author._id;
      }
    } else {
      postObj.author = { id: null, name: "Onbekend", profileImage: null };
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
