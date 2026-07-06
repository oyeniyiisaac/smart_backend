const bcrypt = require('bcryptjs');
const crypto = require('crypto');   // built-in Node.js — no install needed
const fs = require("fs");
const path = require("path");
const jwt = require('jsonwebtoken');
const Admin = require('../model/adminlog.model');
const AdminInvite = require('../model/adminInvite.model');
const AdminCreateSession = require('../model/adminCreateSession.model');

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
            semester, session, venue, mapUrl, longitude, latitude, isSessionActive
        } = req.body;

        const targetLat = latitude ? parseFloat(latitude) : 0;
        const targetLon = longitude ? parseFloat(longitude) : 0;
        const allowedRadius = 10;

        try {
            const configData = {
                latitude: targetLat,
                longitude: targetLon,
                radiusMeters: allowedRadius
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
        });

        const savedSession = await newSession.save();

        return res.status(201).json({
            message: "Session created and 10-meter geofence configuration updated successfully",
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

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT VERIFICATION SYSTEM (Haversine Formula Math Engine)
// ─────────────────────────────────────────────────────────────────────────────

// Internal utility: computes distance in meters over curved space
// POST /student/verify-attendance
const verifyStudentLocation = async (req, res) => {
    try {
        // 1. Get the student's current GPS reading AND the course they are checking into
        const { studentLatitude, studentLongitude, courseCode } = req.body;

        if (!studentLatitude || !studentLongitude || !courseCode) {
            return res.status(400).json({
                message: "Missing required fields. Latitude, longitude, and course code are required."
            });
        }

        // 2. Look up the ACTIVE session inside MongoDB instead of config.json
        // (Assuming your model name is AdminCreateSession)
        const activeSession = await AdminCreateSession.findOne({
            courseCode: courseCode,
            isSessionActive: true
        }).sort({ createdAt: -1 }); // Gets the most recently created one if duplicates exist

        if (!activeSession) {
            return res.status(404).json({
                message: "No active attendance session found for this course."
            });
        }

        const lat1 = parseFloat(studentLatitude);
        const lon1 = parseFloat(studentLongitude);

        // Pull coordinates directly from the database document
        const lat2 = parseFloat(activeSession.latitude);
        const lon2 = parseFloat(activeSession.longitude);

        // Set a reasonable buffer zone (e.g., 40 meters) to account for indoor GPS drift
        const allowedRadius = 200;

        // 3. Accurate Haversine Distance Calculation (in meters)
        const R = 6371e3; // Earth's radius in METERS
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const calculatedDistance = R * c; // Distance in meters

        // 4. DEBUG LOGGING - Check your terminal terminal to see the variance!
        console.log(`\n--- [ATTENDANCE CHECK] ---`);
        console.log(`Course Code:     ${courseCode}`);
        console.log(`Student GPS:     Lat ${lat1.toFixed(6)}, Lon ${lon1.toFixed(6)}`);
        console.log(`Database Target: Lat ${lat2.toFixed(6)}, Lon ${lon2.toFixed(6)}`);
        console.log(`Calculated Gap:  ${calculatedDistance.toFixed(2)} meters`);
        console.log(`Allowed Radius:  ${allowedRadius} meters`);
        console.log(`--------------------------\n`);

        // 5. Evaluation
        if (calculatedDistance <= allowedRadius) {
            return res.status(200).json({
                verified: true,
                message: "Location verified successfully! Attendance marked.",
                distance: calculatedDistance
            });
        } else {
            return res.status(400).json({
                verified: false,
                message: `You are out of bounds. You are ${calculatedDistance.toFixed(1)} meters away from the lecture venue.`,
                distance: calculatedDistance
            });
        }

    } catch (globalError) {
        console.error("❌ Verification Route Error:", globalError);
        return res.status(500).json({ message: "Internal server error during verification." });
    }
};
// POST /admin/attendance-entry [PROTECTED]
// Marks student as present for the current active session (manual override)
// const recordStudentAttendance = async (req, res) => {
//     try {
//         const { matricNo, courseCode, level, session, semester } = req.body;

//         // Find the most recent active session for this course and level
//         const activeSession = await AdminCreateSession.findOne({
//             courseCode: courseCode.toUpperCase(),
//             level: level.toLowerCase(),
//             semester: semester.toLowerCase(),
//             isSessionActive: true,
//         }).sort({ dateTimeFrom: -1 });

//         if (!activeSession) {
//             return res.status(400).json({
//                 message: `No active session found for ${courseCode} - ${level}, ${semester}`,
//             });
//         }

//         // Find student by matric number (assuming your User model has matricNo)
//         // Adjust the model name 'User' if your actual student model is different
//         const student = await User.findOne({ matricno: matricNo });

//         if (!student) {
//             return res.status(404).json({
//                 message: `Student with matric number ${matricNo} not found.`,
//             });
//         }

//         // Check if student is already marked present for this session
//         const isAlreadyPresent = activeSession.attendance.some(entry =>
//             entry.studentId.toString() === student._id.toString()
//         );

//         if (isAlreadyPresent) {
//             return res.status(400).json({
//                 message: `${student.firstname} is already marked as present for this session.`,
//             });
//         }

//         // Mark student as present
//         activeSession.attendance.push({
//             studentId: student._id,
//             matricno: matricNo,
//             courseCode,
//             courseName: activeSession.courseName,
//             level,
//             semester,
//             session,
//             status: 'present',
//             timestamp: new Date(),
//         });

//         await activeSession.save();

//         // Update student's attendance history if needed
//         student.attendanceHistory.push({
//             courseCode,
//             courseName: activeSession.courseName,
//             level,
//             semester,
//             session,
//             status: 'present',
//             date: new Date(),
//             time: new Date().toLocaleTimeString(),
//             location: 'manual_entry',
//         });

//         await student.save();

//         return res.status(200).json({
//             success: true,
//             message: `${student.firstname} has been marked as present for ${activeSession.courseName}.`,
//             data: activeSession,
//             student,
//         });

//     } catch (error) {
//         console.error('Error in manual attendance entry:', error);
//         return res.status(500).json({ message: 'Failed to mark attendance' });
//     }
// };
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
    verifyStudentLocation, // 👈 Exported to mount in your student router endpoints!
};
