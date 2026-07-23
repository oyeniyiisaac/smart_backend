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
    confirmpassword: { type: String, required: true }
}, {
    timestamps: {
        currentTime: () => new Date(Date.now() + 60 * 60 * 1000)
    }
})

studentSchema.pre('save', async function () {
    try {
        const salt = 10
        const rawPassword = this.password
        console.log(rawPassword)
        const hashedPassword = await bcrypt.hash(this.password, salt)
        const hashedconfirmPassword = await bcrypt.hash(this.confirmpassword, salt)
        this.password = hashedPassword
        this.confirmpassword = hashedconfirmPassword
        console.log(hashedconfirmPassword)
        console.log(hashedPassword)

    }
    catch (err) {
        console.log(err)
    }
})


const StudentModel = mongoose.model('Student', studentSchema)

module.exports = StudentModel
