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
    endSession
} = require("../controller/admin.controller");

const router = express.Router();


router.post("/login", loginAdmin);

// Anyone with a valid token from an existing admin can register
router.post("/create", createAdmin);
router.post("/end-session", endSession)

// ─────────────────────────────────────────────
// Protected Admin Routes (Requires valid Admin login)
// ─────────────────────────────────────────────
// Fetch all sessions
router.get("/sessionall", protect, adminGetAllSession);

router.get("/monitor/:id", protect, requireAdmin, getSingleSession);

// Verification of administrative identity
router.get("/dashboard", protect, requireAdmin, adminDashboard);

// Setup a new active class session window
router.post("/createsession", protect, requireAdmin, handleAdminCreateSession);

// Generate a new registration invite token
router.post("/invite", protect, requireAdmin, generateInvite);

// Revoke an active invite token immediately
router.delete("/invite", protect, requireAdmin, revokeInvite);

// 🆕 Fetch the flattened faculty and department list for form dropdowns
router.get("/faculty-list", protect, requireAdmin, getFacultyData);

// Fetch attendance count for a specific session
router.get('/session-attendance/:sessionId', getSessionAttendanceCount);




module.exports = router;