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
        
        // 🏫 DYNAMIC ROUTING FIELDS (For scaling across 13 faculties & 100+ departments)
        faculty: { 
            type: String, 
            required: true 
        }, // e.g., "FCI", "Engineering", "Science"
        department: { 
            type: String, 
            required: true 
        }, // e.g., "Computer Science", "Software Engineering"
        
        // 🆕 Active Validation Strategy Toggles
        useGpsVerification: {
            type: Boolean,
            default: true, // Matches your frontend initialization
        },
        useWifiVerification: {
            type: Boolean,
            default: false,
        },
        useBeaconVerification: {
            type: Boolean,
            default: false,
        },

        // Proximity metrics parameters
        longitude: { type: Number, default: null },
        latitude: { type: Number, default: null },
        isSessionActive: {
            type: Boolean,
            default: true // Automatically sets the created session as active
        },
        expectedBssid: { type: String, default: null },
        expectedSsid: { type: String, default: null },
        beaconUuid: { type: String, default: null },
    },
    { timestamps: true },
);

module.exports = mongoose.model('AdminCreateSession', adminCreateSessionSchema)