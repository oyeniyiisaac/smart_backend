const mongoose = require('mongoose')

const adminCreateSessionSchema = new mongoose.Schema(
    {
        courseName: String,
        courseCode: String,
        level: String,
        dateTimeFrom: {
            type: Date,
            default: () => new Date(Date.now() + 60 * 60 * 1000), // Fallback default to +1hr from now if not sent
        },
        dateTimeTo: {
            type: Date,
            default: () => new Date(Date.now() + 2 * 60 * 60 * 1000), // Fallback default to +2hr from now if not sent
        },
        courseId: String,
        semester: String,
        session: String,
        venue: String,
        mapUrl: String,
        longitude: Number,
        latitude: Number,
        isSessionActive: Boolean,
    },
    { timestamps: true },
);

module.exports = mongoose.model('AdminCreateSession', adminCreateSessionSchema)
