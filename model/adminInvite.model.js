const mongoose = require('mongoose')

const adminInviteSchema = new mongoose.Schema({
    // The actual token string (random, unique)
    token: {
        type: String,
        required: true,
        unique: true,
    },
    // When the token stops being valid
    expiresAt: {
        type: Date,
        required: true,
    },
    // Mark as used after one successful registration — single-use
    used: {
        type: Boolean,
        default: false,
    },
    // Track which admin generated it
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
    },
}, { timestamps: true })

module.exports = mongoose.model('AdminInvite', adminInviteSchema)
