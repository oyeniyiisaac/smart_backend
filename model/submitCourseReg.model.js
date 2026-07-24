const mongoose = require('mongoose');

const courseRegistrationSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student', // Make sure this matches your Student model name
        required: true,
    },
    matricno: {
        type: String,
        required: true,
        trim: true,
    },
    academicSession: {
        type: String, // e.g., "2025/2026"
        required: true,
    },
    semester: {
        type: String, // e.g., "First Semester"
        required: true,
    },
    courses: [
        {
            courseId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Course',
                required: true,
            },
            courseCode: {
                type: String,
                required: true,
            },
            courseTitle: {
                type: String,
                required: true,
            },
            unit: {
                type: Number,
                required: true,
            },
        },
    ],
    totalUnits: {
        type: Number,
        required: true,
        default: 0,
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
    },
}, { 
    timestamps: true // Automatically adds createdAt and updatedAt
});



courseRegistrationSchema.index({ studentId: 1, academicSession: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model('CourseRegistration', courseRegistrationSchema);