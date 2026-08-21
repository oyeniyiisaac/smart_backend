const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
require('dotenv').config()
// const salt = process.env.salt

const studentSchema = new mongoose.Schema({
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    faculty: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    level: { type: String, default: '100L', trim: true },
    matricno: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: (value) => /^\d{10}$/.test(value),
            message: 'Matric number must be exactly 10 digits'
        }
    },
    password: { type: String, required: true },
    profilePicture: { type: String, default: '' },
}, {
    timestamps: true
});

studentSchema.pre('save', async function () {
    try {
        if (!this.isModified('password')) return;
        const salt = 10;
        this.password = await bcrypt.hash(this.password, salt);
    } catch (err) {
        console.error("Error hashing password:", err);
    }
});


const StudentModel = mongoose.model('Student', studentSchema)

module.exports = StudentModel
