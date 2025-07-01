import express from "express";
import { User } from "../models/User.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

const getTranslatedMessage = (req, messageEn, messageAr) => {
  const lang = req.headers["accept-language"]?.includes("ar") ? "ar" : "en";
  return lang === "ar" ? messageAr : messageEn;
};

const generateAppointments = (weeklySchedule, startDate, endDate) => {
  const appointments = [];
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Validate weeklySchedule
  const validDays = weeklySchedule.map((s) => s.day);
  console.log('Generating appointments for days:', validDays);

  // Ensure dates are in EEST (Cairo time)
  const eestOffset = 3 * 60; // EEST is UTC+3
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const localDate = new Date(date.getTime() + eestOffset * 60 * 1000);
    const dayName = daysOfWeek[localDate.getUTCDay()];
    const schedule = weeklySchedule.find((s) => s.day === dayName);

    if (schedule) {
      console.log(`Generating slots for ${dayName} (${localDate.toISOString().split('T')[0]})`);
      let currentTime = new Date(`1970-01-01T${schedule.startTime}:00Z`);
      const endTime = new Date(`1970-01-01T${schedule.endTime}:00Z`);
      let slotIndex = 1;

      while (currentTime < endTime) {
        const formattedDate = localDate.toISOString().split('T')[0];
        const time = currentTime.toISOString().slice(11, 16);

        appointments.push({
          date: formattedDate,
          time,
          isBooked: false,
          patientId: null,
          slotIndex,
          maxPatients: parseInt(schedule.maxPatients),
        });

        currentTime.setMinutes(currentTime.getMinutes() + 50);
        slotIndex++;
      }
    }
  }

  console.log('Generated appointments:', appointments.map(appt => ({ date: appt.date, time: appt.time, day: daysOfWeek[new Date(appt.date).getUTCDay()] })));
  return appointments;
};

router.get("/doctors", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: getTranslatedMessage(req, "User not found", "المستخدم غير موجود"),
      });
    }

    if (user.state !== "patient" && user.state !== "doctor" && user.state !== "admin") {
      return res.status(403).json({
        message: getTranslatedMessage(req, "Only authorized users can view doctors", "يمكن للمستخدمين المصرح لهم فقط عرض الأطباء"),
      });
    }

    const doctors = await User.find({ state: "doctor" }).select("username avatar clinicLocation availableAppointments weeklySchedule");
    res.json(doctors);
  } catch (error) {
    res.status(500).json({
      message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
      error: error.message,
    });
  }
});

router.put("/doctors/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { clinicLocation, weeklySchedule } = req.body;
    const requestingUser = await User.findById(req.user._id);

    if (!requestingUser) {
      return res.status(404).json({
        message: getTranslatedMessage(req, "Requesting user not found", "المستخدم الطالب غير موجود"),
      });
    }

    if (requestingUser.state !== "admin") {
      return res.status(403).json({
        message: getTranslatedMessage(req, "Only admins can update doctor details", "يمكن للمديرين فقط تحديث تفاصيل الأطباء"),
      });
    }

    const doctor = await User.findById(id);
    if (!doctor || doctor.state !== "doctor") {
      return res.status(404).json({
        message: getTranslatedMessage(req, "Doctor not found", "الطبيب غير موجود"),
      });
    }

    if (clinicLocation) {
      if (typeof clinicLocation !== "string" || clinicLocation.trim() === "") {
        return res.status(400).json({
          message: getTranslatedMessage(req, "Invalid clinic location", "موقع العيادة غير صحيح"),
        });
      }
      doctor.clinicLocation = clinicLocation;
    }

    if (weeklySchedule) {
      if (!Array.isArray(weeklySchedule)) {
        return res.status(400).json({
          message: getTranslatedMessage(req, "Weekly schedule must be an array", "الجدول الأسبوعي يجب أن يكون مصفوفة"),
        });
      }

      for (const schedule of weeklySchedule) {
        if (!schedule.day || !schedule.startTime || !schedule.endTime || !schedule.maxPatients) {
          return res.status(400).json({
            message: getTranslatedMessage(req, "Each schedule must have day, startTime, endTime, and maxPatients", "يجب أن يحتوي كل جدول على يوم، وقت البداية، وقت النهاية، وعدد المرضى"),
          });
        }
        if (!/^\d{2}:\d{2}$/.test(schedule.startTime) || !/^\d{2}:\d{2}$/.test(schedule.endTime)) {
          return res.status(400).json({
            message: getTranslatedMessage(req, "Invalid time format. Use HH:MM", "تنسيق الوقت غير صحيح. استخدم HH:MM"),
          });
        }
        if (typeof schedule.maxPatients !== "number" || schedule.maxPatients < 1) {
          return res.status(400).json({
            message: getTranslatedMessage(req, "Max patients must be a positive number", "عدد المرضى يجب أن يكون رقمًا موجبا"),
          });
        }
        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (!validDays.includes(schedule.day)) {
          return res.status(400).json({
            message: getTranslatedMessage(req, "Invalid day of the week", "يوم الأسبوع غير صحيح"),
          });
        }
        const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
        if ((endHour * 60 + endMinute) <= (startHour * 60 + startMinute)) {
          return res.status(400).json({
            message: getTranslatedMessage(req, "End time must be after start time", "وقت النهاية يجب أن يكون بعد وقت البداية"),
          });
        }
      }

      doctor.weeklySchedule = weeklySchedule;

      // Clear ALL existing appointments
      doctor.availableAppointments = [];

      // Generate new appointments for 35 days (5 weeks)
      const today = new Date();
      const eestOffset = 3 * 60 * 60 * 1000; // EEST is UTC+3
      today.setTime(today.getTime() + eestOffset);
      today.setHours(0, 0, 0, 0); // Reset to midnight EEST
      const startDate = new Date(today);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 35); // 5 weeks

      console.log(`Generating appointments from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      doctor.availableAppointments = generateAppointments(weeklySchedule, startDate, endDate);
    }

    await doctor.save();

    res.json({
      message: getTranslatedMessage(req, "Doctor details updated successfully", "تم تحديث تفاصيل الطبيب بنجاح"),
      data: {
        id: doctor._id,
        username: doctor.username,
        avatar: doctor.avatar,
        clinicLocation: doctor.clinicLocation,
        weeklySchedule: doctor.weeklySchedule,
        availableAppointments: doctor.availableAppointments,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
      error: error.message,
    });
  }
});

router.post("/book/:doctorId", authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, time } = req.body;
    const patient = await User.findById(req.user._id);

    if (!patient) {
      return res.status(404).json({
        message: getTranslatedMessage(req, "Patient not found", "المريض غير موجود"),
      });
    }

    if (patient.state !== "patient") {
      return res.status(403).json({
        message: getTranslatedMessage(req, "Only patients can book appointments", "يمكن للمرضى فقط حجز المواعيد"),
      });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.state !== "doctor") {
      return res.status(404).json({
        message: getTranslatedMessage(req, "Doctor not found", "الطبيب غير موجود"),
      });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: getTranslatedMessage(req, "Invalid date format. Use YYYY-MM-DD", "تنسيق التاريخ غير صحيح. استخدم YYYY-MM-DD"),
      });
    }

    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        message: getTranslatedMessage(req, "Invalid time format. Use HH:MM", "تنسيق الوقت غير صحيح. استخدم HH:MM"),
      });
    }

    const appointmentSlot = doctor.availableAppointments.find(
      (slot) => slot.date === date && slot.time === time && !slot.isBooked
    );

    if (!appointmentSlot) {
      return res.status(400).json({
        message: getTranslatedMessage(req, "No available appointment slot for this date and time", "لا توجد فتحة موعد متاحة لهذا التاريخ والوقت"),
      });
    }

    const bookedSlots = doctor.availableAppointments.filter(
      (slot) => slot.date === date && slot.isBooked
    ).length;
    const patientOrder = bookedSlots + 1;
    const maxPatients = appointmentSlot.maxPatients;

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getUTCDay()];
    const schedule = doctor.weeklySchedule.find((s) => s.day === dayName);
    let endTime = '';
    if (schedule) {
      const slotStartMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
      const slotEndMinutes = slotStartMinutes + 50;
      const endSlotHour = Math.floor(slotEndMinutes / 60);
      const endSlotMinute = slotEndMinutes % 60;
      endTime = `${endSlotHour.toString().padStart(2, '0')}:${endSlotMinute.toString().padStart(2, '0')}`;
    }

    appointmentSlot.isBooked = true;
    appointmentSlot.patientId = patient._id;

    await doctor.save();

    patient.bookedAppointments = patient.bookedAppointments || [];
    patient.bookedAppointments.push({
      doctorId: doctor._id,
      date: appointmentSlot.date,
      time: appointmentSlot.time,
      patientOrder,
      maxPatients,
    });

    await patient.save();

    res.json({
      message: getTranslatedMessage(req, "Appointment booked successfully", "تم حجز الموعد بنجاح"),
      appointment: {
        doctor: {
          id: doctor._id,
          username: doctor.username,
          avatar: doctor.avatar,
          clinicLocation: doctor.clinicLocation,
        },
        date: appointmentSlot.date,
        time: appointmentSlot.time,
        endTime,
        patientOrder,
        maxPatients,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: getTranslatedMessage(req, "Server error", "خطأ في الخادم"),
      error: error.message,
    });
  }
});

export default router;