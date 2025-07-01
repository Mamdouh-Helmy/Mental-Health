import express from 'express';
import { Assessment } from '../models/Assessment.js';
import { User } from '../models/User.js'; // تأكد من استيراد نموذج المستخدم

const router = express.Router();

// Middleware للتحقق من أن المستخدم هو admin
const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.body.userId);
        if (!user || user.state !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized: Only admins can perform this action' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// استخدام middleware isAdmin في طريق POST
router.post('/', isAdmin, async (req, res) => {
    try {
        const { userId, questions, totalScore, recommendations } = req.body;
        const assessment = new Assessment({
            userId,
            questions,
            totalScore,
            recommendations
        });
        await assessment.save();
        res.status(201).json(assessment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET: جلب كل التقييمات
router.get('/', async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .sort({ createdAt: -1 });
        res.json(assessments);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET: جلب التقييمات بناءً على userId
router.get('/user/:userId', async (req, res) => {
    try {
        const assessments = await Assessment.find({ userId: req.params.userId })
            .sort({ createdAt: -1 });
        res.json(assessments);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;