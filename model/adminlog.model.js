const mongoose = require('mongoose');

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
        enum: ['super_admin', 'admin'], // 'admin' represents department/lecturer admin
        default: 'admin',
    },
    faculty: {
        type: String,
        trim: true,
        // Optional/not required so 'super_admin' can leave this blank or null
        required: function () {
            return this.role === 'admin';
        }
    },
    department: {
        type: String,
        trim: true,
        // Required only if they are a standard department admin
        required: function () {
            return this.role === 'admin';
        }
    },
    password: {
        type: String,
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);