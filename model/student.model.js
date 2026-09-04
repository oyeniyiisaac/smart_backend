const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
require('dotenv').config()
// const salt = process.env.salt

const studentSchema = new mongoose.Schema({
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    faculty: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    level: { type: String, default: '100L', trim: true },
    matricno: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: (value) => /^\d{10}$/.test(value),
            message: 'Matric number must be exactly 10 digits'
        }
    },
    password: { type: String, required: true },
    profilePicture: { type: String, default: '' },
    // 🔒 1-to-1 Device Binding & Anti-Proxy Attendance Security
    deviceId: { type: String, default: null, index: true },
    deviceInfo: {
        name: { type: String, default: '' },
        platform: { type: String, default: '' },
        browser: { type: String, default: '' },
        os: { type: String, default: '' },
        userAgent: { type: String, default: '' },
        lastIp: { type: String, default: '' },
        boundAt: { type: Date, default: null },
        lastLoginAt: { type: Date, default: null }
    },
    deviceResetRequested: { type: Boolean, default: false },
    deviceResetReason: { type: String, default: '' },
    deviceResetRequestedAt: { type: Date, default: null }
}, {
    timestamps: true
});

studentSchema.pre('save', async function () {
    try {
        if (!this.isModified('password')) return;
        const salt = 10;
        this.password = await bcrypt.hash(this.password, salt);
    } catch (err) {
        console.error("Error hashing password:", err);
    }
});


const StudentModel = mongoose.model('Student', studentSchema)

module.exports = StudentModel
