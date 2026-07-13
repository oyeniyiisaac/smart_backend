const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminCreateSession', // Links directly to the active lecture session
        required: true
    },
    courseCode: {
        type: String,
        required: true
    },
    studentMatric: {
        type: String, // E.g., "2022003337"
        required: true
    },
    verifiedVia: {
        type: String, // 'GPS' or 'Hardware'
        required: true
    },
    verifiedAt: {
        type: Date,
        default: Date.now
    }
});

// Prevent a student from marking attendance twice for the same lecture session!
AttendanceRecordSchema.index({ session: 1, studentMatric: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);