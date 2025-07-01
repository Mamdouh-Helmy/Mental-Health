import mongoose from 'mongoose';

const assessmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questions: [{
    questionText: {
      ar: { type: String, required: true }, // نص السؤال بالعربي
      en: { type: String, required: true }  // نص السؤال بالإنجليزي
    },
    options: [{
      text: {
        ar: { type: String, required: true }, // نص الإجابة بالعربي
        en: { type: String, required: true }  // نص الإجابة بالإنجليزي
      },
      score: { type: Number, required: true } // الدرجة واحدة لكل إجابة بغض النظر عن اللغة
    }]
  }],
  totalScore: {
    type: Number,
    required: true
  },
  recommendations: [{
    ar: { type: String }, // التوصية بالعربي
    en: { type: String }  // التوصية بالإنجليزي
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Assessment = mongoose.model('Assessment', assessmentSchema);