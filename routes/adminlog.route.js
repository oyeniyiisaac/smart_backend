const express = require("express");
const {
    protect,
    requireAdmin,
    generateInvite,
    revokeInvite,
    createAdmin,
    loginAdmin,
    adminCreateSession,
    adminGetAllSession,
    adminDashboard,
    getSingleSession,
    getFacultyData // 🆕 Imported your new controller function
} = require("../controller/admin.controller");

const router = express.Router();

// ─────────────────────────────────────────────
// Public Routes
// ─────────────────────────────────────────────
// Admin login to get JWT token
router.post("/login", loginAdmin);

// Anyone with a valid token from an existing admin can register
router.post("/create", createAdmin);

// ─────────────────────────────────────────────
// Protected Admin Routes (Requires valid Admin login)
// ─────────────────────────────────────────────
// Fetch all sessions
router.get("/sessionall", protect, adminGetAllSession);

// SECURED: Added protect and requireAdmin so unauthorized users can't see specific coordinate nodes
router.get("/monitor/:id", protect, requireAdmin, getSingleSession);

// Verification of administrative identity
router.get("/dashboard", protect, requireAdmin, adminDashboard);

// Setup a new active class session window
router.post("/createsession", protect, requireAdmin, adminCreateSession);

// Generate a new registration invite token
router.post("/invite", protect, requireAdmin, generateInvite);

// Revoke an active invite token immediately
router.delete("/invite", protect, requireAdmin, revokeInvite);

// 🆕 Fetch the flattened faculty and department list for form dropdowns
router.get("/faculty-list", protect, requireAdmin, getFacultyData);



module.exports = router;