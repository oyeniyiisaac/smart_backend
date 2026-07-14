const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminCreateSession',
        required: true
    },
    courseCode: {
        type: String,
        required: true
    },
    studentMatric: {
        type: String,
        required: true
    },
    verifiedVia: {
        type: String,
        enum: ['GPS', 'Hardware', 'None'], // 'None' for absent
        default: 'None'
    },
    status: {
        type: String,
        enum: ['Present', 'Absent'],
        default: 'Present' // Default is present when they verify successfully
    }
}, { timestamps: true });

// Prevent duplicate records for the same student in the same session
AttendanceRecordSchema.index({ session: 1, studentMatric: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);