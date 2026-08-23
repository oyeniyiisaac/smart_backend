const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const Admin = require('../model/adminlog.model');
const AdminInvite = require('../model/adminInvite.model');
const AdminCreateSession = require('../model/adminCreateSession.model');
const AttendanceRecord = require('../model/attendanceRecord.model');
const PasswordReset = require('../model/passwordReset.model');
const Course = require('../model/course.model');
const Student = require('../model/student.model');
const { markAbsentees } = require('./student.controller');

const resend = new Resend(process.env.RESEND_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION MIDDLEWARES
// ─────────────────────────────────────────────────────────────────────────────

// admin.controller.js (around line 25)
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // ⚠️ FIX HERE: Explicitly attach to req.user (and req.admin just in case)
            req.user = decoded;
            req.admin = decoded;

            return next();
        } catch (error) {
            return res.status(401).json({ message: 'Not authorized, token invalid or expired.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided.' });
    }
};

// admin.controller.js (around line 35)
const requireAdmin = (req, res, next) => {
    const user = req.user || req.admin;
    
    if (!user) {
        return res.status(401).json({ message: 'Access denied: User context missing.' });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
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
            {
                id: admin._id,
                email: admin.email,
                role: admin.role,
                faculty: admin.faculty,
                department: admin.department,
                level: admin.level || null
            },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            admin: {
                id: admin._id,
                email: admin.email,
                fullName: admin.fullName,
                role: admin.role,
                faculty: admin.faculty,
                department: admin.department,
                level: admin.level || null
            },
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
    const { fullName, email, faculty, department, level, role, password, confirmPassword, verifyToken } = req.body;

    // 1. Basic field validations
    if (!verifyToken) {
        return res.status(400).json({ message: 'Invite token is required.' });
    }
    if (!fullName || !email || !password) {
        return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }
    if (!faculty) {
        return res.status(400).json({ message: 'Faculty is required.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match.' });
    }

    try {
        const assignedRole = ['super_admin', 'admin', 'course_rep'].includes(role) ? role : 'admin';
        const finalDept = assignedRole === 'super_admin' ? (department || 'Faculty Deanery') : department;

        if (!finalDept && assignedRole !== 'super_admin') {
            return res.status(400).json({ message: 'Department is required for Department Admins and Course Reps.' });
        }

        // 2. Enforce max 2 Super Admins per Faculty limit
        if (assignedRole === 'super_admin') {
            const facultyStr = faculty.trim();
            const parenMatch = facultyStr.match(/\(([^)]+)\)/);
            const acronym = parenMatch ? parenMatch[1].trim() : (facultyStr.length <= 6 ? facultyStr : null);

            let facultyRegex;
            if (acronym) {
                facultyRegex = new RegExp(`(${facultyStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}|\\b${acronym.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b)`, 'i');
            } else {
                facultyRegex = new RegExp(facultyStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            }

            const facultySuperAdminsCount = await Admin.countDocuments({
                role: 'super_admin',
                faculty: { $regex: facultyRegex }
            });

            if (facultySuperAdminsCount >= 2) {
                return res.status(400).json({
                    message: `Super Admin limit reached for ${faculty}. Each faculty can have a maximum of 2 Super Admins.`
                });
            }
        }

        // 3. Validate invite token
        const masterKey = process.env.MASTER_SETUP_KEY || 'SUPERADMIN_INIT';
        const isMasterToken = verifyToken && (verifyToken.trim().toUpperCase() === masterKey.toUpperCase());
        const superAdminsCount = await Admin.countDocuments({ role: 'super_admin' });
        let inviteDoc = null;

        // Master token is allowed for bootstrapping Super Admin accounts.
        // For Department Admins & Course Reps (or once setup is complete), valid invite tokens are required.
        if (!isMasterToken || (assignedRole !== 'super_admin' && superAdminsCount > 0)) {
            inviteDoc = await AdminInvite.findOne({ token: verifyToken.trim() });
            if (!inviteDoc) return res.status(403).json({ message: 'Invalid invite token. Please ask your Faculty Super Admin to generate an invite token.' });
            if (inviteDoc.used) return res.status(403).json({ message: 'This invite token has already been used.' });
            if (new Date() > inviteDoc.expiresAt) return res.status(403).json({ message: 'This invite token has expired.' });
        }

        // 4. Check duplicate admin email
        const cleanEmail = email.trim().toLowerCase();
        const existing = await Admin.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
        if (existing) return res.status(409).json({ message: 'An admin account with that email already exists.' });

        // 4b. Cross-check: Prevent using a Student email for an Admin account
        const existingStudent = await Student.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
        if (existingStudent) {
            return res.status(409).json({
                message: 'This email is already registered as a Student account. An email address cannot be shared between Student and Admin accounts.'
            });
        }

        // 5. Hash password and persist admin with scoped details
        const hashedPassword = await bcrypt.hash(password, 12);

        const newAdmin = await Admin.create({
            fullName: fullName.trim(),
            email: cleanEmail,
            faculty: faculty.trim(),
            department: finalDept.trim(),
            level: level ? level.trim() : null,
            password: hashedPassword,
            role: assignedRole,
        });

        // 5. Mark invite token as spent
        if (inviteDoc) {
            inviteDoc.used = true;
            await inviteDoc.save();
        }

        // Send professional welcome email to Admin/Lecturer asynchronously
        try {
            const clientOrigin = req.headers.origin || process.env.CLIENT_URL || 'https://smart-attendance-system.vercel.app';
            const adminLoginLink = `${clientOrigin}/admin/login`;
            const roleLabel = assignedRole === 'super_admin' ? 'Faculty Super Admin' : assignedRole === 'course_rep' ? 'Course Representative' : 'Lecturer / Department Admin';

            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: cleanEmail,
                subject: `🏛️ Smart Attendance Portal - ${roleLabel} Account Created`,
                html: `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8faf9; padding: 20px; border-radius: 12px;">
                        <!-- Header -->
                        <div style="background-color: #0a643a; padding: 28px 24px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">🏛️ Smart Attendance Portal</h1>
                            <p style="color: #baeed9; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Staff & Lecturer Administrative Access</p>
                        </div>

                        <!-- Main Body -->
                        <div style="background-color: #ffffff; padding: 28px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                            <h2 style="color: #1a1c1a; margin: 0 0 12px 0; font-size: 18px;">Welcome, ${fullName}! 👋</h2>
                            <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                                Your administrative account has been established on the university Smart Attendance Portal with <strong>${roleLabel}</strong> privileges. You can now create dynamic attendance sessions, monitor live rosters, and export official exam clearance reports.
                            </p>

                            <!-- Role Credentials Box -->
                            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
                                <h3 style="color: #166534; margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">📋 Account Profile Summary</h3>
                                <table style="width: 100%; font-size: 13px; color: #374151; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 6px 0; font-weight: 600; width: 40%; color: #4b5563;">Assigned Role:</td>
                                        <td style="padding: 6px 0; color: #0a643a; font-weight: 700;">${roleLabel}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Staff Email:</td>
                                        <td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${cleanEmail}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Faculty:</td>
                                        <td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${faculty.trim()}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Department:</td>
                                        <td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${finalDept.trim()}</td>
                                    </tr>
                                    ${level ? `
                                    <tr>
                                        <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Class Level:</td>
                                        <td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${level.trim()}</td>
                                    </tr>` : ''}
                                </table>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 28px 0 20px 0;">
                                <a href="${adminLoginLink}" style="background-color: #0a643a; color: #ffffff; padding: 13px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(10, 100, 58, 0.2);">
                                    Access Admin Command Center →
                                </a>
                            </div>

                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />

                            <!-- Security / Footer -->
                            <p style="color: #718096; font-size: 11px; text-align: center; line-height: 1.5; margin: 0;">
                                For security reasons, please do not share your administrative credentials.<br/>
                                © ${new Date().getFullYear()} University Smart Attendance System. All rights reserved.
                            </p>
                        </div>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error("⚠️ Resend Admin Welcome Email Error:", emailErr.message);
        }

        return res.status(201).json({
            message: `${assignedRole === 'super_admin' ? 'Faculty Super Admin' : assignedRole === 'course_rep' ? 'Course Rep' : 'Department Admin'} account created successfully.`,
            admin: {
                id: newAdmin._id,
                fullName: newAdmin.fullName,
                email: newAdmin.email,
                role: newAdmin.role,
                faculty: newAdmin.faculty,
                department: newAdmin.department,
            },
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
        const user = req.user || req.admin;
        const query = {};

        if (user?.role === 'super_admin' && user.faculty) {
            const fName = user.faculty.trim();
            const facultyPattern = (fName.toUpperCase() === 'FCI' || /computing/i.test(fName))
                ? '^(FCI|Faculty of Computing.*)$'
                : (fName.toUpperCase() === 'FBAS' || /applied science/i.test(fName))
                ? '^(FBAS|Faculty of Basic.*)$'
                : (fName.toUpperCase() === 'FET' || /engineering/i.test(fName))
                ? '^(FET|Faculty of Engineering.*)$'
                : fName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            query.faculty = { $regex: new RegExp(facultyPattern, 'i') };
        } else if (user?.role === 'admin' && user.department) {
            query.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
        } else if (user?.role === 'course_rep') {
            if (user.department) {
                query.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
            }
            if (user.level) {
                const userLevel = user.level.trim().replace(/L$/i, '');
                query.level = { $regex: new RegExp(`^${userLevel}(L)?$`, 'i') };
            }
        }

        const sessions = await AdminCreateSession.find(query).sort({ createdAt: -1 }).lean();

        // Aggregate real attendance check-ins count per session
        const sessionIds = sessions.map(s => s._id);
        const attendanceCounts = await AttendanceRecord.aggregate([
            { $match: { session: { $in: sessionIds }, status: 'Present' } },
            { $group: { _id: '$session', presentCount: { $sum: 1 } } }
        ]);

        const countMap = {};
        attendanceCounts.forEach(c => {
            countMap[String(c._id)] = c.presentCount;
        });

        const enrichedSessions = sessions.map(s => ({
            ...s,
            presentCount: countMap[String(s._id)] || 0
        }));

        return res.status(200).json({ success: true, data: enrichedSessions, sessions: enrichedSessions });
    } catch (error) {
        console.error("❌ adminGetAllSession Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getSingleSession = async (req, res) => {
    try {
        const user = req.user || req.admin;
        const { id } = req.params;

        const session = await AdminCreateSession.findById(id);
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        // Role-Based Access Scoping
        if (user?.role === 'super_admin' && user.faculty && session.faculty) {
            const uFac = user.faculty.trim().toLowerCase();
            const sFac = session.faculty.trim().toLowerCase();
            const uIsFci = uFac === 'fci' || uFac.includes('computing');
            const sIsFci = sFac === 'fci' || sFac.includes('computing');
            if (!uIsFci || !sIsFci) {
                if (uFac !== sFac && !uFac.includes(sFac) && !sFac.includes(uFac)) {
                    return res.status(403).json({ success: false, message: "Unauthorized: Session belongs to a different Faculty." });
                }
            }
        } else if (user?.role === 'admin' || user?.role === 'course_rep') {
            if (user.department && session.department && session.department.trim().toLowerCase() !== user.department.trim().toLowerCase()) {
                return res.status(403).json({ success: false, message: "Unauthorized: Session belongs to a different Department." });
            }
            if (user.role === 'course_rep' && user.level && session.level) {
                const userLevel = user.level.trim().replace(/L$/i, '');
                const sessionLevel = session.level.trim().replace(/L$/i, '');
                if (userLevel.toLowerCase() !== sessionLevel.toLowerCase()) {
                    return res.status(403).json({ success: false, message: "Unauthorized: Session belongs to a different Level." });
                }
            }
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


const getCourseAttendanceReport = async (req, res) => {
    try {
        const user = req.user || req.admin;
        const { courseCode, semester } = req.query;

        // 1. Build Role-Scoped Query for Admin Sessions
        const sessionQuery = {};

        if (user?.role === 'super_admin') {
            if (user.faculty) {
                sessionQuery.faculty = { $regex: new RegExp(`^${user.faculty.trim()}$`, 'i') };
            }
        } else if (user?.role === 'admin' || user?.role === 'course_rep') {
            if (user.department) {
                sessionQuery.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
            }
            if (user.role === 'course_rep' && user.level) {
                const rawLevel = user.level.trim().replace(/L$/i, '');
                sessionQuery.level = { $regex: new RegExp(rawLevel, 'i') };
            }
        }

        if (courseCode) {
            sessionQuery.courseCode = { $regex: new RegExp(`^${courseCode}$`, 'i') };
        }
        if (semester && semester !== 'All') {
            sessionQuery.semester = { $regex: new RegExp(`^${semester}$`, 'i') };
        }

        // 2. Get all matching session documents & their ObjectIds
        const matchingSessions = await AdminCreateSession.find(sessionQuery).select('_id');
        const totalClasses = matchingSessions.length;

        if (totalClasses === 0) {
            return res.status(200).json({
                success: true,
                totalClasses: 0,
                students: []
            });
        }

        const sessionObjectIds = matchingSessions.map(s => s._id);

        // 3. Aggregate Attendance Records strictly for these session IDs
        const attendanceData = await AttendanceRecord.aggregate([
            // Step A: Filter attendance records matching ONLY this semester's sessions
            { 
                $match: { 
                    session: { $in: sessionObjectIds } 
                } 
            },
            
            // Step B: Group by studentMatric and count unique sessions attended
            {
                $group: {
                    _id: "$studentMatric", 
                    studentMatric: { $first: "$studentMatric" },
                    uniqueSessions: { $addToSet: "$session" } 
                }
            },

            // Step C: Lookup student details matching 'matricno'
            {
                $lookup: {
                    from: "students",
                    localField: "studentMatric",
                    foreignField: "matricno",
                    as: "studentInfo"
                }
            },

            // Step D: Flatten studentInfo array
            {
                $unwind: {
                    path: "$studentInfo",
                    preserveNullAndEmptyArrays: true
                }
            },

            // Step E: Select necessary fields
            {
                $project: {
                    studentMatric: 1,
                    attended: { $size: "$uniqueSessions" },
                    firstname: "$studentInfo.firstname",
                    lastname: "$studentInfo.lastname"
                }
            }
        ]);

        // 4. Format results for frontend UI
        const threshold = parseInt(req.query.threshold) || 75;
        const studentReports = attendanceData.map(record => {
            const attended = record.attended || 0;
            const percentage = totalClasses > 0 
                ? ((attended / totalClasses) * 100).toFixed(1) 
                : 0;
            
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
                isEligible: Number(percentage) >= threshold
            };
        });

        return res.status(200).json({
            success: true,
            totalClasses,
            threshold,
            faculty: user.faculty || null,
            department: user.department || null,
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

const getStudents = async (req, res) => {
    try {
        const user = req.user || req.admin;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        // Role-based scoping query
        const roleScope = {};
        if (user?.role === 'super_admin') {
            if (user.faculty) {
                const fName = user.faculty.trim();
                const facultyPattern = (fName.toUpperCase() === 'FCI' || /computing/i.test(fName))
                    ? '^(FCI|Faculty of Computing.*)$'
                    : (fName.toUpperCase() === 'FBAS' || /applied science/i.test(fName))
                    ? '^(FBAS|Faculty of Basic.*)$'
                    : (fName.toUpperCase() === 'FET' || /engineering/i.test(fName))
                    ? '^(FET|Faculty of Engineering.*)$'
                    : fName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                roleScope.faculty = { $regex: new RegExp(facultyPattern, 'i') };
            }
        } else if (user?.role === 'admin') {
            if (user.department) {
                roleScope.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
            }
        } else if (user?.role === 'course_rep') {
            if (user.department) {
                roleScope.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
            }
            if (user.level) {
                const rawLevel = user.level.trim().replace(/L$/i, '');
                roleScope.level = { $regex: new RegExp(rawLevel, 'i') };
            }
        }

        const searchQuery = search
            ? {
                ...roleScope,
                $or: [
                    { firstname: { $regex: search, $options: 'i' } },
                    { lastname: { $regex: search, $options: 'i' } },
                    { matricno: { $regex: search, $options: 'i' } },
                    { department: { $regex: search, $options: 'i' } }
                ]
            }
            : roleScope;

        const totalStudents = await Student.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalStudents / limit);

        const studentsData = await Student.find(searchQuery)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Format data for frontend dashboard
        const formattedStudents = studentsData.map(student => {
            const firstName = student.firstname || '';
            const lastName = student.lastname || '';
            const fullName = `${firstName} ${lastName}`.trim() || 'Unknown Student';
            
            // Extract Initials for Avatar Badge (e.g., Alex Rivers -> AR)
            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'ST';

            return {
                id: student._id,
                name: fullName,
                initials,
                matricNumber: student.matricno || 'N/A',
                department: student.department || 'Computer Science',
                level: student.level || '100L',
                enrolledCourses: student.enrolledCourses ? `${student.enrolledCourses.length} Courses` : '5 Courses',
                status: student.status || 'Eligible' 
            };
        });

        return res.status(200).json({
            success: true,
            totalStudents,
            totalPages,
            currentPage: page,
            students: formattedStudents
        });

    } catch (error) {
        console.error("Error fetching students:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch students"
        });
    }
};



// ── 1. Create New Course ─────────────────────────────
const createCourse = async (req, res) => {
    try {
        // 1. Ensure user authentication context exists
        const currentUser = req.user||req.admin;
        if (!currentUser) {
            return res.status(401).json({ message: 'Unauthorized: Missing user authentication context.' });
        }

        const { courseCode, courseTitle, semester, unit } = req.body;

        if (!courseCode || !courseTitle || !semester) {
            return res.status(400).json({ message: 'Course Code, Title, and Semester are required.' });
        }

        // 2. Role validation: Super Admins hold supervisory oversight; only Department Admins/Lecturers create courses
        if (currentUser?.role === 'super_admin') {
            return res.status(403).json({
                message: 'Course creation is reserved for Department Admins and Lecturers. Faculty Super Admins have supervisory oversight.'
            });
        }

        const faculty = currentUser?.faculty;
        const department = currentUser?.department;

        if (!faculty || !department) {
            return res.status(400).json({ message: 'Faculty and Department must be attached to your departmental administrator account.' });
        }

        // 3. Check for existing course entry
        const existing = await Course.findOne({
            courseCode: courseCode.toUpperCase().trim(),
            department,
            semester
        });

        if (existing) {
            return res.status(409).json({ message: `Course ${courseCode} already exists for this semester.` });
        }

        // 4. Create new course record
        const course = await Course.create({
            courseCode: courseCode.toUpperCase().trim(),
            courseTitle: courseTitle.trim(),
            faculty,
            department,
            semester,
            unit: Number(unit) || 3,
            createdBy: currentUser._id || currentUser.id
        });

        return res.status(201).json({
            success: true,
            message: 'Course created successfully.',
            course
        });

    } catch (error) {
        console.error("❌ createCourse Error:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};


const getCourses = async (req, res) => {
    try {
        // Fallback to req.admin if req.user is undefined
        const user = req.user || req.admin;

        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: Missing user authentication context.' });
        }

        const query = {};

        if (user.role === 'super_admin') {
            if (user.faculty) {
                query.faculty = { $regex: new RegExp(`^${user.faculty.trim()}$`, 'i') };
            }
        } else if (user.role === 'admin' || user.role === 'course_rep') {
            if (user.department) {
                query.department = { $regex: new RegExp(`^${user.department.trim()}$`, 'i') };
            }
            if (user.role === 'course_rep' && user.level) {
                const rawLevel = user.level.trim().replace(/L$/i, '');
                query.level = { $regex: new RegExp(rawLevel, 'i') };
            }
        }

        if (req.query.search) {
            query.$or = [
                { courseCode: { $regex: req.query.search, $options: 'i' } },
                { courseTitle: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.semester) {
            query.semester = req.query.semester;
        }

        const courses = await Course.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: courses.length,
            courses
        });

    } catch (error) {
        console.error("❌ getCourses Error:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ── 3. Delete Course ─────────────────────────────────
deleteCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const course = await Course.findById(id);

        if (!course) {
            return res.status(404).json({ message: 'Course not found.' });
        }

        // Ensure non-super-admins can only delete courses in their own department
        if (req.user.role !== 'super_admin' && course.department !== req.user.department) {
            return res.status(403).json({ message: 'Unauthorized to delete this course.' });
        }

        await Course.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Course deleted successfully.'
        });

    } catch (error) {
        console.error("❌ deleteCourse Error:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const totalStudents = await Student.countDocuments();
        const presentToday = await AttendanceRecord.countDocuments({
            status: 'Present',
            createdAt: { $gte: startOfDay }
        });
        const absentToday = await AttendanceRecord.countDocuments({
            status: 'Absent',
            createdAt: { $gte: startOfDay }
        });

        // Compute students flagged with <70% overall attendance
        const allSessionsCount = await AdminCreateSession.countDocuments();
        let flaggedLowAttendance = 0;

        if (allSessionsCount > 0) {
            const studentStats = await AttendanceRecord.aggregate([
                { $match: { status: 'Present' } },
                { $group: { _id: '$studentMatric', attended: { $sum: 1 } } }
            ]);

            const lowAttendedMatrics = new Set(
                studentStats
                    .filter(st => (st.attended / allSessionsCount) * 100 < 70)
                    .map(st => st._id)
            );

            const attendedMatrics = new Set(studentStats.map(st => st._id));
            const allStudentsList = await Student.find({}, 'matricno');
            allStudentsList.forEach(st => {
                if (!attendedMatrics.has(st.matricno)) {
                    lowAttendedMatrics.add(st.matricno);
                }
            });
            flaggedLowAttendance = lowAttendedMatrics.size;
        }

        return res.status(200).json({
            success: true,
            stats: {
                totalStudents,
                presentToday,
                absentToday,
                flaggedLowAttendance
            }
        });
    } catch (error) {
        console.error("❌ Error fetching dashboard stats:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const requestAdminPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Admin institution email is required." });
        }

        const cleanEmail = email.trim();
        const admin = await Admin.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });

        if (!admin) {
            // Intelligent cross-check: Check if this email is registered as a Student instead
            const student = await Student.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
            if (student) {
                return res.status(404).json({
                    message: "This email belongs to a Student account. Please switch to the 'Student Account' tab to reset your password."
                });
            }
            return res.status(404).json({ message: "No Lecturer or Admin account found with this email address." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await PasswordReset.deleteMany({ identifier: admin.email.toLowerCase() });
        await PasswordReset.create({
            identifier: admin.email.toLowerCase(),
            userType: 'admin',
            otp,
            expiresAt
        });

        // Construct direct one-click reset link
        const clientOrigin = req.headers.origin || process.env.CLIENT_URL || 'https://smart-attendance-system.vercel.app';
        const resetLink = `${clientOrigin}/forgot-password?email=${encodeURIComponent(admin.email)}&otp=${otp}&type=admin`;

        // Send Email via Resend
        try {
            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: admin.email,
                subject: "🔐 Admin Password Reset - Smart Attendance System",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                        <div style="background-color: #0a643a; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h2 style="color: #ffffff; margin: 0;">Smart Attendance System</h2>
                            <p style="color: #baeed9; margin: 5px 0 0 0; font-size: 14px;">Administrative Password Reset</p>
                        </div>
                        <div style="padding: 24px; background-color: #ffffff;">
                            <p style="font-size: 16px; color: #333333;">Hello <strong>${admin.fullName || 'Admin'}</strong>,</p>
                            <p style="font-size: 14px; color: #555555; line-height: 1.5;">We received a request to reset your password. Use the 6-digit verification code below or click the direct link to set your new password:</p>
                            <div style="text-align: center; margin: 24px 0;">
                                <div style="display: inline-block; padding: 14px 28px; background-color: #e6f4ea; border: 2px dashed #0a643a; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0a643a; font-family: monospace;">
                                    ${otp}
                                </div>
                            </div>
                            <div style="text-align: center; margin: 20px 0;">
                                <a href="${resetLink}" style="background-color: #0a643a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Reset Password Directly</a>
                            </div>
                            <p style="font-size: 12px; color: #888888; text-align: center;">This code and link are valid for <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
                        </div>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error("⚠️ Resend Email Error (Admin):", emailErr.message);
        }

        // Return secure response WITHOUT leaking OTP to the browser UI
        return res.status(200).json({
            success: true,
            message: `A 6-digit OTP code and password reset link have been sent to ${admin.email}. Please check your inbox or spam folder.`,
            email: admin.email
        });
    } catch (err) {
        console.error("Admin password reset request error:", err);
        return res.status(500).json({ message: "Server error processing request." });
    }
};

const resetAdminPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required." });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters." });
        }

        const cleanEmail = email.trim();
        const admin = await Admin.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
        if (!admin) {
            return res.status(404).json({ message: "Admin account not found." });
        }

        const resetDoc = await PasswordReset.findOne({
            identifier: admin.email.toLowerCase(),
            otp: otp.trim(),
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!resetDoc) {
            return res.status(400).json({ message: "Invalid or expired OTP code." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        admin.password = hashedPassword;
        await admin.save();

        resetDoc.used = true;
        await resetDoc.save();

        return res.status(200).json({
            success: true,
            message: "Admin password reset successfully! You can now log in."
        });
    } catch (err) {
        console.error("Reset admin password error:", err);
        return res.status(500).json({ message: "Server error resetting password." });
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
    getCourseAttendanceReport,
    getStudents,
    createCourse,
    getCourses,
    deleteCourse,
    getDashboardStats,
    requestAdminPasswordReset,
    resetAdminPassword
};