// models/Comment.js
import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  postId: { // New field: Link comment to its parent post
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true, // A comment must belong to a post
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment', // Self-reference to Comment model
    default: null, // Null for top-level comments
  },
  // replies: [ // Removed: We will query for replies based on parentCommentId
  //   {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'Comment',
  //   },
  // ],
});

export default mongoose.model('Comment', commentSchema);