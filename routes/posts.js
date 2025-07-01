import express from 'express';
import Post from '../models/Post.js';
import { User } from '../models/User.js';
import Comment from '../models/Comment.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Helper function to populate user data for comments
const populateCommentUser = (query) => {
  return query.populate('userId', 'username avatar state');
};

// --- POSTS RELATED ROUTES ---

// Create new post
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const post = new Post({
      userId: req.user._id,
      content,
    });

    await post.save();
    const populatedPost = await Post.findById(post._id).populate('userId', 'username avatar state');

    // Emit to all clients in 'community' room and specific post room
    req.io.to('community').to(post._id.toString()).emit('newPost', populatedPost);
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Create post error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Get all posts
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'username avatar state')
      .sort({ createdAt: -1 });

    const postsWithComments = await Promise.all(posts.map(async (post) => {
      const topLevelComments = await Comment.find({ postId: post._id, parentCommentId: null })
        .populate('userId', 'username avatar state')
        .sort({ createdAt: 1 });

      return {
        ...post.toObject(),
        comments: topLevelComments,
      };
    }));

    res.json(postsWithComments);
  } catch (error) {
    console.error('Error fetching posts:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Update post
router.put('/:postId', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (post.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Unauthorized to update this post' });
    }
    post.content = content;
    await post.save();

    const populatedPost = await Post.findById(post._id).populate('userId', 'username avatar state');

    // Emit to 'community' room and specific post room
    req.io.to('community').to(req.params.postId).emit('updatedPost', populatedPost);
    res.json(populatedPost);
  } catch (error) {
    console.error('Update post error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Delete post
router.delete('/:postId', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (post.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Unauthorized to delete this post' });
    }

    await Comment.deleteMany({ postId: req.params.postId });
    await Post.deleteOne({ _id: req.params.postId });

    // Emit to 'community' room and specific post room
    req.io.to('community').to(req.params.postId).emit('deletedPost', { postId: req.params.postId });
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Like/unlike post
router.post('/:postId/like', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    const userId = req.user._id;
    const likeIndex = post.likes.indexOf(userId);
    const liked = likeIndex === -1;
    if (liked) {
      post.likes.push(userId);
    } else {
      post.likes.splice(likeIndex, 1);
    }
    await post.save();

    // Emit to 'community' room and specific post room
    req.io.to('community').to(req.params.postId).emit('postLiked', { postId: req.params.postId, userId, liked });
    res.json({ postId: req.params.postId, userId, liked, likesCount: post.likes.length });
  } catch (error) {
    console.error('Like post error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// --- COMMENTS RELATED ROUTES ---

// Add new comment or reply
router.post('/:postId/comments', authenticateToken, async (req, res) => {
  try {
    const { content, parentCommentId } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = new Comment({
      userId: req.user._id,
      content,
      postId: req.params.postId,
      parentCommentId: parentCommentId || null,
    });

    await comment.save();
    const populatedComment = await populateCommentUser(Comment.findById(comment._id));

    // Emit to 'community' room and specific post room
    req.io.to('community').to(req.params.postId).emit('newComment', {
      postId: req.params.postId,
      comment: populatedComment,
    });
    res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Add comment error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Get comments for a post
router.get('/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ postId: postId })
      .populate('userId', 'username avatar state')
      .sort({ createdAt: 1 });

    const buildCommentTree = (commentsArr, parentId = null) => {
      const tree = [];
      commentsArr.forEach(comment => {
        if (comment.parentCommentId === parentId || (comment.parentCommentId && comment.parentCommentId.toString() === parentId)) {
          const replies = buildCommentTree(commentsArr, comment._id.toString());
          tree.push({ ...comment.toObject(), replies: replies });
        }
      });
      return tree;
    };

    const commentTree = buildCommentTree(comments);
    res.json(commentTree);
  } catch (error) {
    console.error('Error fetching comments for post:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Update comment
router.put('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    if (comment.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Unauthorized to update this comment' });
    }

    comment.content = content;
    await comment.save();

    const populatedComment = await populateCommentUser(Comment.findById(comment._id));

    // Emit to 'community' room and specific post room
    req.io.to('community').to(req.params.postId).emit('updatedComment', {
      postId: req.params.postId,
      comment: populatedComment,
    });
    res.json(populatedComment);
  } catch (error) {
    console.error('Update comment error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const commentToDelete = await Comment.findById(commentId);
    if (!commentToDelete) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    if (commentToDelete.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Unauthorized to delete this comment' });
    }

    const commentsToDeleteIds = [];
    const findRepliesRecursively = async (currentCommentId) => {
      commentsToDeleteIds.push(currentCommentId);
      const replies = await Comment.find({ parentCommentId: currentCommentId }, '_id');
      for (const reply of replies) {
        await findRepliesRecursively(reply._id);
      }
    };

    await findRepliesRecursively(commentId);
    await Comment.deleteMany({ _id: { $in: commentsToDeleteIds } });

    // Emit to 'community' room and specific post room
    req.io.to('community').to(postId).emit('deletedComment', {
      postId: postId,
      deletedCommentIds: commentsToDeleteIds,
    });

    res.json({ message: 'Comment(s) deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error.message);
    res.status(400).json({ message: error.message });
  }
});

export default router;