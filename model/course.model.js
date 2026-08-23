const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    courseCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    courseTitle: {
        type: String,
        required: true,
        trim: true,
    },
    faculty: {
        type: String,
        required: true,
        trim: true,
    },
    department: {
        type: String,
        required: true,
        trim: true,
    },
    semester: {
        type: String,
        required: true, // e.g. "2025/2026 First Semester"
    },
    unit: {
        type: Number,
        required: true,
        default: 3,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
    }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);