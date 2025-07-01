import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  age: { type: Number, required: true },
  type: { type: String, required: true, enum: ["male", "female"] },
  state: { type: String, required: true, enum: ["doctor", "patient", "admin"] },
  avatar: {
    type: String,
    default:
      "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg",
  },
  clinicLocation: {
    type: String,
    default: "",
  },
  weeklySchedule: [
    {
      day: { type: String, required: true, enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      maxPatients: { type: Number, required: true, min: 1 },
    },
  ],
  availableAppointments: [
    {
      date: { type: String, required: true },
      time: { type: String, required: true },
      isBooked: { type: Boolean, default: false },
      patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      slotIndex: { type: Number, required: true },
      maxPatients: { type: Number, required: true, min: 1 },
    },
  ],
  bookedAppointments: [
    {
      doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      date: { type: String, required: true },
      time: { type: String, required: true },
      patientOrder: { type: Number, required: true, min: 1 },
      maxPatients: { type: Number, required: true, min: 1 },
    },
  ],
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export const User = mongoose.model("User", userSchema);