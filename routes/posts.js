import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Post from '../models/Post.js';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join('public', 'uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({ storage });

// Helper to convert stored relative paths into absolute URLs
const makeAbsoluteUrl = (req, p) => {
  if (!p) return p;
  if (typeof p !== 'string') return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const pathPart = p.startsWith('/') ? p : `/${p}`;
  return `${req.protocol}://${req.get('host')}${pathPart}`;
};

// Create a post (multipart/form-data: file + caption)
// Require authentication: author will be taken from the token (req.user.id)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image is required' });

  const imagePath = `/uploads/${req.file.filename}`; // served from /public
  const { caption } = req.body;

  // Use authenticated user as author
  if (!req.user || !req.user.id) {
    try { if (req.file && req.file.path) await fs.promises.unlink(req.file.path); } catch (e) {}
    return res.status(401).json({ error: 'Authentication required' });
  }
  // ensure the user exists (fresh read) and use that as the author
  const uploader = await User.findById(req.user.id).select('name profileImage');
  if (!uploader) {
    try { if (req.file && req.file.path) await fs.promises.unlink(req.file.path); } catch (e) {}
    return res.status(401).json({ error: 'Authenticated user not found' });
  }

  const post = await Post.create({ image: imagePath, caption, author: uploader._id });

  // build response using uploader info to avoid cases where populate might return stale/mis-mapped data
  const out = post.toJSON ? post.toJSON() : post;
  out.image = makeAbsoluteUrl(req, out.image);
  out.author = {
    id: uploader._id.toString(),
    name: uploader.name,
    profileImage: makeAbsoluteUrl(req, uploader.profileImage),
  };

  return res.status(201).json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all posts (paginated optional)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name profileImage')
      .lean();

    const out = posts.map((p) => {
      const copy = { ...p };
      copy.image = makeAbsoluteUrl(req, copy.image);
      if (copy.author) {
        copy.author.profileImage = makeAbsoluteUrl(req, copy.author.profileImage);
        if (copy.author._id) {
          copy.author.id = copy.author._id.toString();
          delete copy.author._id;
        }
      } else {
        // ensure author object exists in response even if DB post had no author
        copy.author = { id: null, name: 'Onbekend', profileImage: null };
      }
      return copy;
    });
    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get single post
router.get('/:id', async (req, res) => {
  try {
  const post = await Post.findById(req.params.id).populate('author', 'name profileImage');
  if (!post) return res.status(404).json({ error: 'Not found' });
  const postObj = post.toJSON ? post.toJSON() : post;
  postObj.image = makeAbsoluteUrl(req, postObj.image);
  if (postObj.author) {
    postObj.author.profileImage = makeAbsoluteUrl(req, postObj.author.profileImage);
  }
  return res.json(postObj);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete post (optional)
router.delete('/:id', async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
