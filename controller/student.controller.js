const StudentModel = require('../model/student.model');
const AdminCreateSession = require('../model/adminCreateSession.model');
const AttendanceRecord = require('../model/attendanceRecord.model');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const jwt = require('jsonwebtoken');

const resend = new Resend(process.env.RESEND_API_KEY);

// ----------------------------------------------------
// 1. REGISTER
// ----------------------------------------------------
const register = async (req, res) => {
    try {
        const { firstname, lastname, email, matricno, faculty, department, password, confirmpassword } = req.body;

        if (password !== confirmpassword) {
            return res.status(400).json({ message: "Passwords do not match." });
        }

        const existingMatric = await StudentModel.findOne({ matricno });
        if (existingMatric) {
            return res.status(400).json({ message: "Matric number already exists." });
        }

        const existingEmail = await StudentModel.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: "Email already exists." });
        }

        // // Hash password before saving
        // const salt = await bcrypt.genSalt(10);
        // const hashedPassword = await bcrypt.hash(password, salt);

        const newStudent = new StudentModel({
            firstname,
            lastname,
            email,
            matricno,
            faculty,
            department,
            password,
            confirmpassword,
        });

        const result = await newStudent.save();

        // Send confirmation email asynchronously (do not block response on failure)
        try {
            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: email,
                subject: "Welcome to Attendance System",
                html: `<p>Congrats ${firstname} on signing up!</p>`
            });
        } catch (emailErr) {
            console.error("⚠️ Resend Email Error:", emailErr.message);
        }

        return res.status(201).json({ 
            message: 'Registration successful', 
            data: { id: result._id, email: result.email, matricno: result.matricno } 
        });

    } catch (error) {
        console.error("❌ Register Error:", error);
        return res.status(500).json({ message: "Internal server error during registration." });
    }
};

const signin = (req, res) => {
    res.render('signin');
};

// ----------------------------------------------------
// 2. LOGIN
// ----------------------------------------------------
const login = async (req, res) => {
    try {
        const { matricno, password } = req.body;

        const student = await StudentModel.findOne({ matricno });
        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        const verifyPassword = await bcrypt.compare(password, student.password);
        if (!verifyPassword) {
            return res.status(401).json({ message: "Invalid password." });
        }

        const payload = {
            id: student._id,
            firstname: student.firstname,
            lastname: student.lastname,
            email: student.email,
            matricno: student.matricno,
            faculty: student.faculty,
            department: student.department,
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        return res.status(200).json({
            message: 'Sign in successful',
            data: { id: student._id },
            token
        });

    } catch (error) {
        console.error("❌ Login Error:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

// ----------------------------------------------------
// 3. DASHBOARD
// ----------------------------------------------------
const dashboard = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Access denied. Missing or invalid token format." });
        }

        const token = authHeader.split(' ')[1];
        const authUser = jwt.verify(token, process.env.JWT_SECRET);

        const user = await StudentModel.findOne({ matricno: authUser.matricno });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.status(200).json({
            message: "Dashboard",
            result: {
                firstname: user.firstname,
                lastname: user.lastname || null,
                matricno: user.matricno,
                department: user.department || null,
                faculty: user.faculty || null,
            },
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Invalid or expired token." });
        }
        return res.status(500).json({ message: "Server error." });
    }
};

// ----------------------------------------------------
// 4. VERIFY LOCATION & MARK ATTENDANCE
// ----------------------------------------------------
const verifyStudentLocation = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        const cleanHeader = authHeader.replace(/[\r\n]+/g, ' ').trim();
        if (!cleanHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Access denied. Invalid token formatting." });
        }

        const token = cleanHeader.split(' ')[1];

        let authUser;
        try {
            authUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: "Invalid or expired token." });
        }

        const studentMatric = authUser?.matricno || authUser?.id || authUser?._id;
        if (!studentMatric) {
            return res.status(401).json({ message: "Unauthorized. Student identification missing from token." });
        }

        const {
            studentLatitude,
            studentLongitude,
            courseCode,
            scannedBssid,
            scannedUuid,
            verificationMethodChosen
        } = req.body;

        if (!courseCode) {
            return res.status(400).json({ message: "Course code is required." });
        }

        if (verificationMethodChosen === 'gps' || (!scannedBssid && !scannedUuid)) {
            if (studentLatitude === undefined || studentLongitude === undefined) {
                return res.status(400).json({ message: "GPS Verification requires active Latitude and Longitude." });
            }
        }

        const activeSession = await AdminCreateSession.findOne({
            courseCode: courseCode,
            isSessionActive: true,
        }).sort({ createdAt: -1 });

        if (!activeSession) {
            return res.status(404).json({ message: "No active attendance session found for this course." });
        }

        // ⏱️ Session Timeout Validation
        const sessionDurationLimit = 60 * 60 * 1000; // 1 Hour limit
        const currentTime = new Date();
        const sessionAge = currentTime - new Date(activeSession.createdAt);

        if (sessionAge > sessionDurationLimit) {
            activeSession.isSessionActive = false;
            await activeSession.save();

            await markAbsentees(activeSession._id, activeSession.courseCode, activeSession.department);

            return res.status(410).json({
                verified: false,
                message: "This attendance session has expired and is now closed.",
            });
        }

        // Hardware Verification Strategy
        let verifiedViaHardware = false;

        if (activeSession?.expectedBssid && scannedBssid) {
            if (activeSession.expectedBssid.toString().toLowerCase().trim() === scannedBssid.toString().toLowerCase().trim()) {
                verifiedViaHardware = true;
            }
        }

        if (activeSession?.beaconUuid && scannedUuid) {
            if (activeSession.beaconUuid.toString().toLowerCase().trim() === scannedUuid.toString().toLowerCase().trim()) {
                verifiedViaHardware = true;
            }
        }

        if (verifiedViaHardware) {
            try {
                await AttendanceRecord.create({
                    session: activeSession._id,
                    courseCode: courseCode,
                    studentMatric: studentMatric,
                    verifiedVia: "Hardware",
                    status: "Present"
                });
            } catch (dbError) {
                if (dbError.code === 11000) {
                    return res.status(400).json({
                        verified: false,
                        message: "You have already marked attendance for this session!"
                    });
                }
                throw dbError;
            }

            return res.status(200).json({
                verified: true,
                message: "Location verified successfully via Hardware Lock! Attendance marked.",
                verifiedVia: "Hardware"
            });
        }

        if (verificationMethodChosen === 'wifi' || verificationMethodChosen === 'beacon') {
            return res.status(400).json({
                verified: false,
                message: "Hardware verification failed. Connected to invalid hardware.",
                status: "Absent"
            });
        }

        // Safe Haversine GPS Calculation
        const lat1 = parseFloat(studentLatitude) || 0;
        const lon1 = parseFloat(studentLongitude) || 0;
        const lat2 = parseFloat(activeSession.latitude) || 0;
        const lon2 = parseFloat(activeSession.longitude) || 0;

        const allowedRadius = 200; // Radius in meters
        const R = 6371e3; // Earth radius in meters
        
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

        const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(1 - Math.min(1, a)));
        const calculatedDistance = R * c;

        if (calculatedDistance <= allowedRadius) {
            try {
                await AttendanceRecord.create({
                    session: activeSession._id,
                    courseCode: courseCode,
                    studentMatric: studentMatric,
                    verifiedVia: "GPS",
                    status: "Present"
                });
            } catch (dbError) {
                if (dbError.code === 11000) {
                    return res.status(400).json({
                        verified: false,
                        message: "You have already marked attendance for this session!",
                    });
                }
                throw dbError;
            }

            return res.status(200).json({
                verified: true,
                message: "Location verified successfully via GPS Geofence! Attendance marked.",
                distance: calculatedDistance,
                verifiedVia: "GPS"
            });
        } else {
            return res.status(400).json({
                verified: false,
                message: `Out of bounds. You are ${calculatedDistance.toFixed(1)} meters away from the lecture venue.`,
                distance: calculatedDistance,
                status: "Absent"
            });
        }

    } catch (globalError) {
        console.error("❌ Verification Route Error:", globalError);
        return res.status(500).json({ message: "Internal server error during verification." });
    }
};

// ----------------------------------------------------
// 5. GET ACTIVE SESSIONS FOR STUDENT
// ----------------------------------------------------
const getActiveSessionsForStudent = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Access denied. Invalid token formatting." });
        }

        const token = authHeader.split(' ')[1];
        const decodedStudent = jwt.verify(token, process.env.JWT_SECRET);
        const studentId = decodedStudent.id || decodedStudent._id;

        const student = await StudentModel.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Student profile not found." });
        }

        const { faculty: studentFaculty, department: studentDepartment } = student;

        if (!studentFaculty || !studentDepartment) {
            return res.status(400).json({
                message: `Student profile incomplete. Faculty/Department missing.`
            });
        }

        const now = new Date();
        const activeSessions = await AdminCreateSession.find({
            isSessionActive: true,
            dateTimeTo: { $gt: now },
            faculty: { $regex: new RegExp(studentFaculty.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
            department: { $regex: new RegExp(studentDepartment.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            sessions: activeSessions
        });

    } catch (error) {
        console.error("❌ Error fetching filtered sessions:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

// ----------------------------------------------------
// 6. AUTOMARK ABSENTEES
// ----------------------------------------------------
const markAbsentees = async (sessionId, courseCode, department) => {
    try {
        const allStudents = await StudentModel.find({ department }, 'matricno');
        const allMatricNumbers = allStudents.map(student => student.matricno);

        const presentRecords = await AttendanceRecord.find({ session: sessionId }, 'studentMatric');
        const presentMatricNumbers = presentRecords.map(record => record.studentMatric);

        const absentMatricNumbers = allMatricNumbers.filter(
            matric => !presentMatricNumbers.includes(matric)
        );

        if (absentMatricNumbers.length === 0) return;

        const absenteeRecords = absentMatricNumbers.map(matric => ({
            session: sessionId,
            courseCode: courseCode,
            studentMatric: matric,
            verifiedVia: "None",
            status: "Absent"
        }));

        await AttendanceRecord.insertMany(absenteeRecords, { ordered: false });

    } catch (error) {
        if (error.code !== 11000) {
            console.error("❌ Error marking department absentees:", error);
        }
    }
};

// ----------------------------------------------------
// 7. GET MY ATTENDANCE RECORDS
// ----------------------------------------------------
const myAttendance = async (req, res) => {
    try {
        let studentMatric = req.user?.matricno || req.user?.studentMatric;

        if (!studentMatric) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.replace(/[\r\n]+/g, ' ').trim().split(' ')[1];
                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    studentMatric = decoded?.matricno || decoded?.id || decoded?._id;
                }
            }
        }

        if (!studentMatric) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Student matric number missing."
            });
        }

        const cleanMatric = String(studentMatric).trim();

        const records = await AttendanceRecord.find({ studentMatric: cleanMatric })
            .populate('session')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: records.length,
            records
        });

    } catch (error) {
        console.error("❌ Error fetching attendance:", error);
        return res.status(500).json({
            success: false,
            message: "Server error fetching attendance records."
        });
    }
};

module.exports = { 
    register, 
    signin, 
    login, 
    dashboard, 
    verifyStudentLocation, 
    getActiveSessionsForStudent, 
    markAbsentees, 
    myAttendance 
};