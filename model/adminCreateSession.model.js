const mongoose = require('mongoose');

const adminCreateSessionSchema = new mongoose.Schema({
    courseName: { type: String, required: true },
    courseCode: { type: String, required: true },
    level: { type: String, required: true },
    dateTimeFrom: { type: Date, required: true },
    dateTimeTo: { type: Date, required: true },
    courseId: { type: String },
    semester: { type: String },
    session: { type: String },
    venue: { type: String, required: true },
    
    faculty: { type: String, default: "" },
    department: { type: String, default: "" },

    mapUrl: { type: String, default: null },
    longitude: { type: Number, default: null },
    latitude: { type: Number, default: null },
    isSessionActive: { type: Boolean, default: true },
    
    // Additional verification options
    useGpsVerification: { type: Boolean, default: true },
    useWifiVerification: { type: Boolean, default: false },
    useBeaconVerification: { type: Boolean, default: false },
    
    expectedBssid: { type: String, default: null },
    expectedSsid: { type: String, default: null },
    beaconUuid: { type: String, default: null }
}, { 
    timestamps: true,
    // Explicitly binding to your exact MongoDB collection name:
    collection: 'admincreatesessions' 
});

// Avoid "Cannot overwrite model once compiled" errors during hot-reloads
module.exports = mongoose.models.AdminCreateSession || mongoose.model('AdminCreateSession', adminCreateSessionSchema);