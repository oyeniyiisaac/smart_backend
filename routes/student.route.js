const express = require('express')
const { register, signin, login, dashboard, verifyStudentLocation, getActiveSessionsForStudent } = require('../controller/student.controller')
// const verifyToken = require('../middleware.auth');
const router = express.Router()

router.get('/signin', signin)
router.get('/dashboard', dashboard)
router.get('/active-sessions', getActiveSessionsForStudent);


router.post('/register', register)
router.post('/login', login)
router.post("/verify-attendance", verifyStudentLocation);


module.exports = router
