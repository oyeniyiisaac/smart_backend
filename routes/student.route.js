const express = require('express')
const { register, signin, login, dashboard, verifyStudentLocation } = require('../controller/student.controller')
const router = express.Router()

router.get('/signin', signin)
router.get('/dashboard', dashboard)


router.post('/register', register)
router.post('/login', login)
router.post("/verify-attendance", verifyStudentLocation);


module.exports = router
