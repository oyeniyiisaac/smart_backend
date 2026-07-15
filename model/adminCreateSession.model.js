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
    
    useGpsVerification: { type: Boolean, default: true },
    useWifiVerification: { type: Boolean, default: false },
    useBeaconVerification: { type: Boolean, default: false },
    
    expectedBssid: { type: String, default: null },
    expectedSsid: { type: String, default: null },
    beaconUuid: { type: String, default: null }
}, { timestamps: true });

// module.exports = mongoose.model('AdminCreateSession', adminCreateSessionSchema);
// 🟢 NEW LINE: Renaming the compiled model name forces Mongoose to register the new schema fields!
module.exports = mongoose.model('AdminCreateSessionV2', adminCreateSessionSchema, 'admincreatesessions');