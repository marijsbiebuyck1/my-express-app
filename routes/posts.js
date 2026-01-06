import express from "express";
import Post from "../models/Post.js";
import auth from "../middleware/auth.js";

const router = express.Router();

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

    // Support token payloads that use `id` or `_id` and ensure it's a string
    const rawAuthor = req.user.id || req.user._id || (req.user._doc && (req.user._doc.id || req.user._doc._id));
    if (!rawAuthor) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const authorId = String(rawAuthor);

    const post = await Post.create({
      image: imageData,
      caption,
      author: authorId,
    });

    // populate author (name + profileImage) for the response
    const populated = await Post.findById(post._id)
      .populate("author", "name profileImage")
      .lean();
    if (populated && populated.author && populated.author._id) {
      populated.author.id = populated.author._id.toString();
      delete populated.author._id;
    }
    // ensure likes present (compute from likedBy if available)
    if (populated) {
      populated.likes = Array.isArray(populated.likedBy) ? populated.likedBy.length : (populated.likes || 0);
      if (populated.likedBy) delete populated.likedBy;
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
  // compute likes from likedBy when present
  copy.likes = Array.isArray(copy.likedBy) ? copy.likedBy.length : (copy.likes || 0);
  if (copy.likedBy) delete copy.likedBy;
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
  // ensure likes present (compute from likedBy if available)
  postObj.likes = Array.isArray(postObj.likedBy) ? postObj.likedBy.length : (postObj.likes || 0);
  if (postObj.likedBy) delete postObj.likedBy;
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

// POST /posts/:id/like - increment likes count (requires auth)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "Not found" });
    // determine author id from req.user (support different token shapes)
    const rawAuthor = req.user?.id || req.user?._id || (req.user?._doc && (req.user._doc.id || req.user._doc._id));
    if (!rawAuthor) return res.status(401).json({ error: "Authentication required" });
    const authorId = String(rawAuthor);

    post.likedBy = post.likedBy || [];
    // prevent duplicate likes
    if (post.likedBy.map(String).includes(authorId)) {
      // already liked — return current state
    } else {
      post.likedBy.push(authorId);
      post.likes = post.likedBy.length;
      await post.save();
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name profileImage")
      .lean();
    if (populated && populated.author && populated.author._id) {
      populated.author.id = populated.author._id.toString();
      delete populated.author._id;
    }
    // compute likes from likedBy array when present
    populated.likes = Array.isArray(populated.likedBy) ? populated.likedBy.length : (populated.likes || 0);
    // don't leak likedBy array to clients
    if (populated.likedBy) delete populated.likedBy;
    return res.json(populated || post);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /posts/:id/unlike - decrement likes count (requires auth)
router.post("/:id/unlike", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "Not found" });

    const rawAuthor = req.user?.id || req.user?._id || (req.user?._doc && (req.user._doc.id || req.user._doc._id));
    if (!rawAuthor) return res.status(401).json({ error: "Authentication required" });
    const authorId = String(rawAuthor);

    post.likedBy = post.likedBy || [];
    const idx = post.likedBy.map(String).indexOf(authorId);
    if (idx === -1) {
      // not liked by this user — no-op
    } else {
      post.likedBy.splice(idx, 1);
      post.likes = Math.max(0, post.likedBy.length);
      await post.save();
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name profileImage")
      .lean();
    if (populated && populated.author && populated.author._id) {
      populated.author.id = populated.author._id.toString();
      delete populated.author._id;
    }
    populated.likes = Array.isArray(populated.likedBy) ? populated.likedBy.length : (populated.likes || 0);
    if (populated.likedBy) delete populated.likedBy;
    return res.json(populated || post);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
