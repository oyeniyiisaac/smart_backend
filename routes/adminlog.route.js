const express = require("express");
const {
    protect,
    requireAdmin,
    generateInvite,
    revokeInvite,
    createAdmin,
    loginAdmin,
    adminGetAllSession,
    adminDashboard,
    getSingleSession,
    getFacultyData,
    handleAdminCreateSession,
    getSessionAttendanceCount,
    endSession,
    closeAttendanceSession,
    getCourseAttendanceReport,
    getStudents
} = require("../controller/admin.controller");

const router = express.Router();

// Public Routes
router.post("/login", loginAdmin);
router.post("/create", createAdmin); // Registration via invite token

// ─────────────────────────────────────────────
// Protected Admin Routes (Requires valid Admin login)
// ─────────────────────────────────────────────

// Session Closure Routes (Protected + Flexible ID routing)
router.post("/end-session/:id", protect, requireAdmin, closeAttendanceSession);
router.patch("/close-session/:id", protect, requireAdmin, closeAttendanceSession);

// Fetch all sessions
router.get("/sessionall", protect, adminGetAllSession);

// Session Details & Monitoring
router.get("/monitor/:id", protect, requireAdmin, getSingleSession);

// Verification of administrative identity
router.get("/dashboard", protect, requireAdmin, adminDashboard);

// Setup a new active class session window
router.post("/createsession", protect, requireAdmin, handleAdminCreateSession);

// Generate a new registration invite token
router.post("/invite", protect, requireAdmin, generateInvite);

// Revoke an active invite token immediately
router.delete("/invite", protect, requireAdmin, revokeInvite);

// Faculty & Department list
router.get("/faculty-list", protect, requireAdmin, getFacultyData);

// Fetch attendance count for a specific session
router.get('/session-attendance/:sessionId', protect, requireAdmin, getSessionAttendanceCount);


// Attendance reports per course
router.get('/reports', protect, requireAdmin, getCourseAttendanceReport)

// Fetch student  records
router.get('/studentmanagement',protect,requireAdmin,getStudents)
module.exports = router;