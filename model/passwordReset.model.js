const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    userType: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student',
    },
    otp: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }, // MongoDB automatic TTL expiration
    },
    used: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
