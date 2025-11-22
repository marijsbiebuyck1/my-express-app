import express from 'express';
import multer from 'multer';
import path from 'path';
import Post from '../models/Post.js';
import User from '../models/User.js';

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
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image is required' });

  const imagePath = `/uploads/${req.file.filename}`; // served from /public
  const { caption } = req.body;

  // Resolve author: prefer explicit authorId, then authorEmail, then authorName
  let authorIdToUse = undefined;
  if (req.body.authorId) authorIdToUse = req.body.authorId;
  else if (req.body.authorEmail) {
    const u = await User.findOne({ email: req.body.authorEmail.toLowerCase().trim() }).select('_id');
    if (u) authorIdToUse = u._id;
  } else if (req.body.authorName) {
    // try to find a single matching user by name
    const candidates = await User.find({ name: req.body.authorName }).select('_id').limit(2).lean();
    if (candidates.length === 1) authorIdToUse = candidates[0]._id;
  }

  const post = await Post.create({ image: imagePath, caption, author: authorIdToUse || undefined });

  // populate author (name + profileImage) for the response
  const populated = await Post.findById(post._id).populate('author', 'name profileImage').lean();
  if (populated) {
    populated.image = makeAbsoluteUrl(req, populated.image);
    if (populated.author) {
      populated.author.profileImage = makeAbsoluteUrl(req, populated.author.profileImage);
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
