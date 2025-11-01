import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    image: { type: String, required: true }, // path to uploaded image in /public/uploads
    caption: { type: String },
    likes: { type: Number, default: 0 },
    comments: [
      {
        authorName: { type: String },
        text: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

postSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Post = mongoose.model('Post', postSchema);
export default Post;
