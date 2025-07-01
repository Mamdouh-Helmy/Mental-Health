import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import userRoutes from './routes/users.js';
import assessmentRoutes from './routes/assessments.js';
import postRoutes from './routes/posts.js';
import bookingRoutes from './routes/bookings.js'; // Added booking routes
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

const onlineUsers = new Set();

app.use(cookieParser());
app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
  req.io = io;
  next();
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication token missing'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  onlineUsers.add(socket.userId);
  io.emit('onlineUsers', Array.from(onlineUsers));

  socket.on('authenticate', (token) => {
    console.log(`User authenticated: ${socket.userId}`);
  });

  socket.on('joinCommunityRoom', () => {
    socket.join('community');
    console.log(`User ${socket.userId} joined community room`);
  });

  socket.on('joinPostRoom', (postId) => {
    socket.join(postId);
    console.log(`User ${socket.userId} joined post room: ${postId}`);
  });

  socket.on('leavePostRoom', (postId) => {
    socket.leave(postId);
    console.log(`User ${socket.userId} left post room: ${postId}`);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      io.emit('onlineUsers', Array.from(onlineUsers));
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.use('/api/users', userRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/bookings', bookingRoutes); // Added booking routes

mongoose
  .connect('mongodb+srv://mm9349263:qRCl6878pJDWUc3K@cluster0.tfsxy.mongodb.net/mental-health-platform?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});