import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { User } from "../models/User.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Helper function to determine language and translate messages
const getTranslatedMessage = (req, messageEn, messageAr) => {
  const lang = req.headers["accept-language"]?.includes("ar") ? "ar" : "en";
  return lang === "ar" ? messageAr : messageEn;
};

// ✅ Get current user
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({
          message: getTranslatedMessage(
            req,
            "User not found",
            "المستخدم غير موجود"
          ),
        });
    }
    res.json(user);
  } catch (error) {
    res
      .status(500)
      .json({
        message: getTranslatedMessage(
          req,
          "Error fetching user",
          "خطأ في جلب بيانات المستخدم"
        ),
        error: error.message,
      });
  }
});

// ✅ Get all users (optional: add security restrictions if needed)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res
      .status(500)
      .json({
        message: getTranslatedMessage(
          req,
          "Error fetching users",
          "خطأ في جلب المستخدمين"
        ),
        error: error.message,
      });
  }
});

// ✅ Register a new user
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, age, type, state, avatar } = req.body;

    // Validate required fields
    if (!username || !email || !password || !age || !type || !state) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "All fields are required",
            "جميع الحقول مطلوبة"
          ),
        });
    }

    // Validate username format
    const usernameRegex = /^[\u0600-\u06FFa-zA-Z0-9@]+$/;
    if (!usernameRegex.test(username)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Username must contain only Arabic/English letters, numbers, and @",
            "اسم المستخدم يجب أن يحتوي على حروف عربية/إنجليزية، أرقام، و@ فقط"
          ),
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Invalid email format",
            "البريد الإلكتروني غير صحيح"
          ),
        });
    }

    // Validate password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#؟])[A-Za-z\d@#؟]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Password must contain at least 8 characters including uppercase, lowercase, number, and special character (@ # ؟)",
            "كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل مع حرف كبير، صغير، رقم، وحرف خاص (@ # ؟)"
          ),
        });
    }

    // Validate age
    if (!/^\d+$/.test(age) || Number(age) < 18) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Age must be a number greater than 18",
            "العمر يجب أن يكون رقمًا أكبر من 18"
          ),
        });
    }

    // Validate gender
    if (!["male", "female"].includes(type)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Gender must be 'male' or 'female'",
            "الجنس يجب أن يكون 'ذكر' أو 'أنثى'"
          ),
        });
    }

    // Validate role
    if (!["doctor", "patient", "admin"].includes(state)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Role must be 'doctor', 'patient', or 'admin'",
            "الدور يجب أن يكون 'طبيب'، 'مريض'، أو 'مدير'"
          ),
        });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Email already exists",
            "البريد الإلكتروني موجود بالفعل"
          ),
        });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      age,
      type,
      state,
      avatar: avatar || "",
    });

    await user.save();

    // Create JWT token with state
    const token = jwt.sign({ userId: user._id, state: user.state }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // Return response without password
    res.status(201).json({
      token,
      user: {
        id: user._id,
        username,
        email,
        age,
        type,
        state,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
        error: error.message,
      });
  }
});

// ✅ User login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Email and password are required",
            "البريد الإلكتروني وكلمة المرور مطلوبان"
          ),
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Invalid email format",
            "البريد الإلكتروني غير صحيح"
          ),
        });
    }

    // Validate password meets requirements
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#?!])[A-Za-z\d@#?!]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res
        .status(400)
        .json({
          message: getTranslatedMessage(
            req,
            "Password does not meet requirements",
            "كلمة المرور لا تلبي المتطلبات"
          ),
        });
    }

    // Find user by email including password
    const user = await User.findOne({ email }).select("+password");

    // If user not found or password doesn't match, return a unified error message
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res
        .status(401)
        .json({
          message: getTranslatedMessage(
            req,
            "Email or password is incorrect",
            "البريد الإلكتروني أو كلمة المرور غير صحيح"
          ),
        });
    }

    // Create JWT token with state
    const token = jwt.sign({ userId: user._id, state: user.state }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // Return response without password
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        age: user.age,
        type: user.type,
        state: user.state,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Server error:", error);
    res
      .status(500)
      .json({
        message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
        error: error.message,
      });
  }
});

// ✅ Update user account
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      email,
      age,
      type,
      state,
      avatar,
      currentPassword,
      newPassword,
    } = req.body;
    const requestingUserId = req.user._id;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({
          message: getTranslatedMessage(
            req,
            "User not found",
            "المستخدم غير موجود"
          ),
        });
    }

    // Verify the requesting user can only update their own account
    if (user._id.toString() !== requestingUserId) {
      return res
        .status(403)
        .json({
          message: getTranslatedMessage(
            req,
            "Unauthorized to update this account",
            "غير مخول لتحديث هذا الحساب"
          ),
        });
    }

    // Validate username if provided
    if (username) {
      const usernameRegex = /^[\u0600-\u06FFa-zA-Z0-9@]+$/;
      if (!usernameRegex.test(username)) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Invalid username format",
              "اسم المستخدم غير صحيح"
            ),
          });
      }
      user.username = username;
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Invalid email format",
              "البريد الإلكتروني غير صحيح"
            ),
          });
      }

      // Check if new email is already taken
      const emailExists = await User.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Email already in use by another account",
              "البريد الإلكتروني مستخدم بالفعل بواسطة حساب آخر"
            ),
          });
      }
      user.email = email;
    }

    // Validate age if provided
    if (age) {
      if (!/^\d+$/.test(age) || Number(age) < 18) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Age must be a number greater than 18",
              "العمر يجب أن يكون رقمًا أكبر من 18"
            ),
          });
      }
      user.age = age;
    }

    // Validate type if provided
    if (type) {
      if (!["male", "female"].includes(type)) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Invalid gender",
              "الجنس غير صحيح"
            ),
          });
      }
      user.type = type;
    }

    // Validate state if provided
    if (state) {
      if (!["doctor", "patient", "admin"].includes(state)) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Invalid role",
              "الدور غير صحيح"
            ),
          });
      }
      user.state = state;
    }

    // Update avatar if provided
    if (avatar) {
      user.avatar = avatar;
    }

    // Handle password change if requested
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({
            message: getTranslatedMessage(
              req,
              "Current password is required to change password",
              "كلمة المرور الحالية مطلوبة لتغيير كلمة المرور"
            ),
          });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({
            message: getTranslatedMessage(
              req,
              "Current password is incorrect",
              "كلمة المرور الحالية غير صحيحة"
            ),
          });
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#؟])[A-Za-z\d@#؟]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          message: getTranslatedMessage(
            req,
            "New password must contain at least 8 characters including uppercase, lowercase, number, and special character (@ # ؟)",
            "كلمة المرور الجديدة يجب أن تحتوي على 8 أحرف على الأقل مع حرف كبير، صغير، رقم، وحرف خاص (@ # ؟)"
          ),
        });
      }

      user.password = newPassword;
    }

    // Save updated user
    await user.save();

    // Return updated user without password
    const updatedUser = await User.findById(id).select("-password");
    res.json(updatedUser);
  } catch (error) {
    res
      .status(500)
      .json({
        message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
        error: error.message,
      });
  }
});

// ✅ Delete user account
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user._id;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({
          message: getTranslatedMessage(
            req,
            "User not found",
            "المستخدم غير موجود"
          ),
        });
    }

    // Verify the requesting user can only delete their own account
    if (user._id.toString() !== requestingUserId) {
      return res
        .status(403)
        .json({
          message: getTranslatedMessage(
            req,
            "Unauthorized to delete this account",
            "غير مخول لحذف هذا الحساب"
          ),
        });
    }

    // Delete the user
    await User.findByIdAndDelete(id);

    res.json({
      message: getTranslatedMessage(
        req,
        "User account deleted successfully",
        "تم حذف حساب المستخدم بنجاح"
      ),
    });
  } catch (error) {
    res
      .status(500)
      .json({
        message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
        error: error.message,
      });
  }
});

export default router;