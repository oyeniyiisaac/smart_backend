const express = require('express')
const { register, signin, login, dashboard, verifyStudentLocation, getActiveSessionsForStudent, myAttendance } = require('../controller/student.controller')
const verifyToken = require('../middleware.auth');
const { getCourses } = require('../controller/admin.controller');
const router = express.Router()

router.get('/signin', signin)
router.get('/dashboard', verifyToken, dashboard)
router.get('/active-sessions', verifyToken, getActiveSessionsForStudent);
router.get('/my-attendance', verifyToken, myAttendance);
router.get("/courses", verifyToken, getCourses);


router.post('/register', register)
router.post('/login', login)
router.post("/verify-attendance", verifyToken, verifyStudentLocation);


module.exports = router
