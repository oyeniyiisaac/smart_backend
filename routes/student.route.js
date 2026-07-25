const express = require('express')
const { register, signin, login, dashboard, verifyStudentLocation, getActiveSessionsForStudent, myAttendance, getStudentRegistrations, submitCourseRegistration, getMyCourses, uploadProfilePicture } = require('../controller/student.controller')
const verifyToken = require('../middleware.auth');
const { getCourses } = require('../controller/admin.controller');
const { upload } = require('../Utils/cloudinary');
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
router.post("/verify-attendance", verifyToken, verifyStudentLocation);
router.post("/submit-course-registration", verifyToken, submitCourseRegistration);
router.post(
    '/upload-avatar',
    verifyToken,
    upload.single('profilePicture'),
    uploadProfilePicture
);



module.exports = router
