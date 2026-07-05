const mongoose = require('mongoose')

const adminSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    role: {
        type: String,
        enum: ['admin'],
        default: 'admin'
    },
    password: {
        type: String,
        required: true,
    },
}, { timestamps: true })

module.exports = mongoose.model('Admin', adminSchema)
