const bcrypt = require('bcryptjs');
const crypto = require('crypto');   // built-in Node.js — no install needed
const fs = require("fs");
const path = require("path");
const jwt = require('jsonwebtoken');
const Admin = require('../model/adminlog.model');
const AdminInvite = require('../model/adminInvite.model');
const AdminCreateSession = require('../model/adminCreateSession.model');
const facultyData = require('../Utils/api.js');

const configPath = path.join(__dirname, '..', 'config.json');

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION MIDDLEWARES
// ─────────────────────────────────────────────────────────────────────────────

// Protect routes — only logged-in admins can access
const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded; // { id, email, role }
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalid or expired' });
    }
};

// Ensure logged-in user has the correct admin privileges
const requireAdmin = (req, res, next) => {
    if (!req.admin || req.admin.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admins only.' });
    }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PROFILE & AUTHENTICATION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// 🆕 GET /admin/faculty-data [PROTECTED or PUBLIC depending on your router layout]
const getFacultyData = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: facultyData
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    }
};

// GET /admin/dashboard [PROTECTED]
const adminDashboard = async (req, res) => {
    try {
        return res.status(200).json({
            message: "Welcome to the admin dashboard",
            admin: {
                id: req.admin.id,
                email: req.admin.email
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// POST /admin/login [PUBLIC]
const loginAdmin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin._id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' } // 1 day expiration so administrators don't timeout rapidly
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            admin: { id: admin._id, email: admin.email, fullName: admin.fullName },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// POST /admin/invite [PROTECTED]
const generateInvite = async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        const rawToken = crypto.randomBytes(32).toString('hex');

        await AdminInvite.create({
            token: rawToken,
            expiresAt,
            createdBy: req.admin.id,
        });

        return res.status(201).json({
            message: `Invite token generated. Valid for ${hours} hour(s).`,
            token: rawToken,
            expiresAt,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// POST /admin/create [PUBLIC]
const createAdmin = async (req, res) => {
    const { fullName, email, password, confirmPassword, verifyToken } = req.body;

    if (!verifyToken) {
        return res.status(400).json({ message: 'Invite token is required.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match.' });
    }

    try {
        const invite = await AdminInvite.findOne({ token: verifyToken });
        if (!invite) return res.status(403).json({ message: 'Invalid invite token.' });
        if (invite.used) return res.status(403).json({ message: 'This invite token has already been used.' });
        if (new Date() > invite.expiresAt) return res.status(403).json({ message: 'This invite token has expired.' });

        const existing = await Admin.findOne({ email });
        if (existing) return res.status(409).json({ message: 'An admin with that email already exists.' });

        const hashedPassword = await bcrypt.hash(password, 12);
        const newAdmin = await Admin.create({
            fullName,
            email,
            password: hashedPassword,
            role: 'admin',
        });

        invite.used = true;
        await invite.save();

        return res.status(201).json({
            message: 'Admin account created successfully.',
            admin: { id: newAdmin._id, email: newAdmin.email, fullName: newAdmin.fullName },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// DELETE /admin/invite [PROTECTED]
const revokeInvite = async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token is required.' });

    try {
        const invite = await AdminInvite.findOne({ token });
        if (!invite) return res.status(404).json({ message: 'Invite token not found.' });
        if (invite.used) return res.status(400).json({ message: 'Token is already revoked or used.' });

        invite.used = true;
        await invite.save();

        return res.status(200).json({ message: 'Invite token revoked successfully.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE SESSION MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /admin/create-session [PROTECTED]
const adminCreateSession = async (req, res) => {
    try {
        const {
            courseName, courseCode, level, dateTimeFrom, dateTimeTo, courseId,
            semester, session, venue, mapUrl, longitude, latitude, isSessionActive,
            expectedBssid,
            expectedSsid,
            beaconUuid
        } = req.body;

        const targetLat = latitude ? parseFloat(latitude) : 0;
        const targetLon = longitude ? parseFloat(longitude) : 0;
        const allowedRadius = 300;

        try {
            const configData = {
                latitude: targetLat,
                longitude: targetLon,
                radiusMeters: allowedRadius,
                expectedBssid: expectedBssid || null,
                expectedSsid: expectedSsid || null,
                beaconUuid: beaconUuid || null
            };
            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
        } catch (fileError) {
            console.error("❌ File System Error:", fileError.message);
            return res.status(500).json({ message: "Failed to write config", error: fileError.message });
        }

        const newSession = new AdminCreateSession({
            courseName,
            courseCode,
            level,
            dateTimeFrom,
            dateTimeTo,
            courseId,
            semester,
            session,
            venue,
            mapUrl,
            longitude: targetLon,
            latitude: targetLat,
            isSessionActive: isSessionActive !== undefined ? isSessionActive : true,
            expectedBssid,
            expectedSsid,
            beaconUuid
        });

        const savedSession = await newSession.save();

        return res.status(201).json({
            message: "Session created successfully with Geofence, Wi-Fi, and Beacon constraints.",
            data: savedSession,
        });

    } catch (globalError) {
        console.error("❌ Critical Controller Error:", globalError);
        if (!res.headersSent) {
            return res.status(500).json({ message: "An internal backend crash occurred", error: globalError.message });
        }
    }
};

// GET /admin/all-sessions [PROTECTED]
const adminGetAllSession = async (req, res) => {
    try {
        const sessions = await AdminCreateSession.find({
            isSessionActive: true,
        }).sort({ createdAt: -1 });
        if (!sessions || sessions.length === 0) {
            return res.status(200).json({ data: [], message: 'No sessions found' });
        }
        return res.status(200).json({ data: sessions });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// GET /admin/session/:id [PROTECTED]
const getSingleSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await AdminCreateSession.findById(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Session not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: session,
        });
    } catch (error) {
        console.error("Error fetching single session:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message,
        });
    }
};

module.exports = {
    protect,
    requireAdmin,
    generateInvite,
    revokeInvite,
    createAdmin,
    loginAdmin,
    adminDashboard,
    adminCreateSession,
    adminGetAllSession,
    getSingleSession,
    getFacultyData // 🆕 Added to exports
};