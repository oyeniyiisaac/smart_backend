const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Admin = require('../model/adminlog.model');
const AdminInvite = require('../model/adminInvite.model');
const AdminCreateSession = require('../model/adminCreateSession.model');
const AttendanceRecord = require('../model/attendanceRecord.model');
const Student = require('../model/student.model');
const { markAbsentees } = require('./student.controller');

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION MIDDLEWARES
// ─────────────────────────────────────────────────────────────────────────────

const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalid or expired' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.admin || req.admin.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admins only.' });
    }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PROFILE & AUTHENTICATION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// Simplified: Handled directly by frontend, returned as confirmation if called
const getFacultyData = async (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Faculty data managed directly by frontend."
    });
};

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
        console.error("❌ adminDashboard Error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

const loginAdmin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

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
            { expiresIn: '1d' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            admin: { id: admin._id, email: admin.email, fullName: admin.fullName },
        });
    } catch (err) {
        console.error("❌ loginAdmin Error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

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
        console.error("❌ generateInvite Error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

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
        console.error("❌ createAdmin Error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

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
        console.error("❌ revokeInvite Error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE SESSION MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

const handleAdminCreateSession = async (req, res) => {
    try {
        const {
            courseName, courseCode, level, faculty, department, dateTimeFrom, dateTimeTo, courseId,
            semester, session, venue, mapUrl, longitude, latitude, isSessionActive,
            useGpsVerification, useWifiVerification, useBeaconVerification,
            expectedBssid, expectedSsid, beaconUuid
        } = req.body;

        const targetLat = latitude ? parseFloat(latitude) : 0;
        const targetLon = longitude ? parseFloat(longitude) : 0;

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
            faculty,
            department,
            mapUrl,
            longitude: targetLon,
            latitude: targetLat,
            isSessionActive: isSessionActive !== undefined ? isSessionActive : true,
            useGpsVerification: useGpsVerification !== undefined ? useGpsVerification : true,
            useWifiVerification: useWifiVerification || false,
            useBeaconVerification: useBeaconVerification || false,
            expectedBssid: useWifiVerification ? expectedBssid : null,
            expectedSsid: useWifiVerification ? expectedSsid : null,
            beaconUuid: useBeaconVerification ? beaconUuid : null
        });

        const savedSession = await newSession.save();

        return res.status(201).json({
            message: "Session created successfully with designated verification constraints.",
            data: savedSession,
        });

    } catch (globalError) {
        console.error("❌ handleAdminCreateSession Error:", globalError);
        return res.status(500).json({ message: "An internal backend crash occurred", error: globalError.message });
    }
};

const adminGetAllSession = async (req, res) => {
    try {
        const sessions = await AdminCreateSession.find({});
        return res.status(200).json({ data: sessions });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getSingleSession = async (req, res) => {
    try {
        const { id } = req.params;

        const session = await AdminCreateSession.findById(id);
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        const attendanceRecords = await AttendanceRecord.find({ session: id });

        // Query real student records from MongoDB using the matric number
        const checkedInStudents = await Promise.all(
            attendanceRecords.map(async (record) => {
                const student = await Student.findOne({ matricno: record.studentMatric }).select('firstname lastname');
                return {
                    _id: record._id,
                    name: student ? `${student.firstname} ${student.lastname}` : record.studentMatric,
                    matricNumber: record.studentMatric,
                    timeCheckedIn: record.createdAt,
                    isLocationVerified: record.verifiedVia === 'GPS' || record.verifiedVia === 'Hardware'
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: {
                ...session.toObject(),
                checkedInStudents
            },
        });
    } catch (error) {
        console.error("❌ Error in getSingleSession:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const getSessionAttendanceCount = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const totalStudents = await AttendanceRecord.countDocuments({ session: sessionId });
        const presentStudents = await AttendanceRecord.find({ session: sessionId })
            .select('studentMatric verifiedVia createdAt');

        return res.status(200).json({
            success: true,
            totalStudents,
            presentStudents
        });
    } catch (error) {
        console.error("❌ Error fetching attendance count:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const closeAttendanceSession = async (req, res) => {
    try {
        // 1. Extract raw ID input from params or body
        let rawId =
            req.params.id ||
            req.params.sessionId ||
            req.body.sessionId ||
            req.body.id ||
            req.body._id;

        // 2. Safely unwrap the ID if an object was passed instead of a string
        if (typeof rawId === 'object' && rawId !== null) {
            rawId = rawId._id || rawId.id || rawId.sessionId || rawId;
        }

        const sessionId = String(rawId || '').trim();

        if (!sessionId || sessionId === '[object Object]') {
            return res.status(400).json({
                success: false,
                message: "Invalid Session ID provided."
            });
        }

        // 3. Update session status in MongoDB
        const updatedSession = await AdminCreateSession.findByIdAndUpdate(
            sessionId,
            {
                isSessionActive: false,
                dateTimeTo: new Date()
            },
            { new: true }
        );

        if (!updatedSession) {
            return res.status(404).json({ success: false, message: "No active session found with this ID." });
        }

        // 4. Safely attempt absentee marking
        try {
            if (typeof markAbsentees === 'function') {
                await markAbsentees(
                    updatedSession._id,
                    updatedSession.courseCode || '',
                    updatedSession.department || ''
                );
            }
        } catch (absenteeErr) {
            console.error("⚠️ Non-fatal error in markAbsentees:", absenteeErr.message || absenteeErr);
        }

        return res.status(200).json({
            success: true,
            message: `Attendance session for ${updatedSession.courseCode || 'course'} closed successfully.`,
            session: updatedSession
        });

    } catch (error) {
        console.error("❌ Error closing session:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message
        });
    }
};

// import AdminCreateSession from '../models/AdminCreateSession.js'; // targets 'admincreatesessions'
// import AttendanceRecord from '../models/AttendanceRecord.js';     // targets 'attendancerecords'
// import Student from '../models/Student.js';                       // targets 'students'


const getCourseAttendanceReport = async (req, res) => {
    try {
        const { courseCode, semester } = req.query;

        // 1. Build Query Filter for Sessions & Attendance
        const sessionQuery = {};
        if (courseCode) {
            sessionQuery.courseCode = { $regex: new RegExp(`^${courseCode}$`, 'i') };
        }
        if (semester && semester !== 'All') {
            sessionQuery.semester = { $regex: new RegExp(`^${semester}$`, 'i') };
        }

        // 2. Count Total Sessions held for this course/semester
        const totalClasses = await AdminCreateSession.countDocuments(sessionQuery);

        if (totalClasses === 0) {
            return res.status(200).json({
                success: true,
                totalClasses: 0,
                students: []
            });
        }

        // 3. Aggregate Student Attendance
        const attendanceData = await AttendanceRecord.aggregate([
            // Step A: Filter attendance records by courseCode
            { 
                $match: { 
                    courseCode: { $regex: new RegExp(`^${courseCode}$`, 'i') } 
                } 
            },
            
            // Step B: Group by studentMatric and collect unique sessions attended
            {
                $group: {
                    _id: "$studentMatric", 
                    studentMatric: { $first: "$studentMatric" },
                    uniqueSessions: { $addToSet: "$session" } 
                }
            },

            // Step C: Lookup student details from 'students' collection
            {
                $lookup: {
                    from: "students",             // MongoDB collection name for students
                    localField: "studentMatric",  // Field in attendance
                    foreignField: "studentMatric",// Field in students collection (or 'matricNumber')
                    as: "studentInfo"
                }
            },

            // Step D: Extract student info
            {
                $unwind: {
                    path: "$studentInfo",
                    preserveNullAndEmptyArrays: true
                }
            },

            // Step E: Project final output
            {
                $project: {
                    studentMatric: 1,
                    attended: { $size: "$uniqueSessions" },
                    firstname: "$studentInfo.firstname",
                    lastname: "$studentInfo.lastname"
                }
            }
        ]);

        // 4. Format output records for frontend
        const studentReports = attendanceData.map(record => {
            const attended = record.attended || 0;
            const percentage = ((attended / totalClasses) * 100).toFixed(1);
            
            // Combine firstname and lastname if present
            const fullName = record.firstname && record.lastname 
                ? `${record.firstname} ${record.lastname}`
                : record.firstname || record.lastname || "Unknown Student";

            return {
                id: record._id,
                name: fullName,
                matric: record.studentMatric || "N/A",
                totalClasses: totalClasses,
                attended: attended,
                percentage: Number(percentage),
                isEligible: Number(percentage) >= 70
            };
        });

        return res.status(200).json({
            success: true,
            totalClasses,
            students: studentReports
        });

    } catch (error) {
        console.error("Error generating attendance report:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate report"
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
    handleAdminCreateSession,
    adminGetAllSession,
    getSingleSession,
    getFacultyData,
    getSessionAttendanceCount,
    closeAttendanceSession,
    endSession: closeAttendanceSession,
    getCourseAttendanceReport
};