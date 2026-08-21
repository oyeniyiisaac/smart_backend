const express = require('express')
<<<<<<< Updated upstream
const { register, signin, login, dashboard, verifyStudentLocation, getActiveSessionsForStudent, myAttendance, getStudentRegistrations, submitCourseRegistration, getMyCourses, uploadProfilePicture } = require('../controller/student.controller')
const verifyToken = require('../middleware.auth');
const { getCourses } = require('../controller/admin.controller');
=======
const { register, signin, login, dashboard, verifyStudentLocation } = require('../controller/student.controller')
>>>>>>> Stashed changes
const router = express.Router()

router.get('/signin', signin)
router.get('/dashboard', verifyToken, dashboard)
router.get('/active-sessions', verifyToken, getActiveSessionsForStudent);
router.get('/my-attendance', verifyToken, myAttendance);
router.get("/courses", verifyToken, getCourses);
router.get("/get-student-registrations", verifyToken, getStudentRegistrations);
router.get("/my-courses", verifyToken, getMyCourses);


router.post('/register', register)
router.post('/login', login)
<<<<<<< Updated upstream
router.post("/verify-attendance", verifyToken, verifyStudentLocation);
router.post("/submit-course-registration", verifyToken, submitCourseRegistration);
router.post("/upload-profile-picture", verifyToken, uploadProfilePicture);
=======
router.post("/verify-attendance", verifyStudentLocation);
>>>>>>> Stashed changes


module.exports = router
