const StudentModel = require('../model/student.model');
const AdminModel = require('../model/adminlog.model');
const AdminCreateSession = require('../model/adminCreateSession.model');
const AttendanceRecord = require('../model/attendanceRecord.model');
const PasswordReset = require('../model/passwordReset.model');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const jwt = require('jsonwebtoken');
const CourseRegistration = require('../model/submitCourseReg.model');
const cloudinary = require('cloudinary').v2;


const resend = new Resend(process.env.RESEND_API_KEY);

// ----------------------------------------------------
// 1. REGISTER
// ----------------------------------------------------
const register = async (req, res) => {
    try {
        const { firstname, lastname, email, matricno, faculty, department, level, password, confirmpassword } = req.body;

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

        const newStudent = new StudentModel({
            firstname,
            lastname,
            email,
            matricno,
            faculty,
            department,
            level: level || '100L',
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
            data: { id: result._id, email: result.email, matricno: result.matricno, level: result.level }
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
            level: student.level || '100L',
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
                level: user.level || '100L',
                profilePicture: user.profilePicture || null,
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
            sessionId,
            slot,
            timestamp,
            rawQR,
            scannedBssid,
            scannedUuid,
            verificationMethodChosen
        } = req.body;

        if (!courseCode) {
            return res.status(400).json({ message: "Course code is required." });
        }

        if (verificationMethodChosen === 'gps') {
            if (studentLatitude === undefined || studentLongitude === undefined) {
                return res.status(400).json({ message: "GPS Verification requires active Latitude and Longitude." });
            }
        }

        let activeSession;
        if (sessionId) {
            activeSession = await AdminCreateSession.findOne({
                _id: sessionId,
                isSessionActive: true
            });
        } else {
            activeSession = await AdminCreateSession.findOne({
                courseCode: courseCode,
                isSessionActive: true,
            }).sort({ createdAt: -1 });
        }

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

        // 📷 Anti-Proxy Dynamic QR Code Verification Strategy
        if (verificationMethodChosen === 'qr') {
            const now = Date.now();
            const ROTATION_INTERVAL = 20; // 20-second dynamic slot
            const currentSlot = Math.floor(now / (ROTATION_INTERVAL * 1000));
            
            let isValidQR = false;

            if (slot !== undefined) {
                const scannedSlot = parseInt(slot);
                // Allow current slot or previous slot (grace period of 20 seconds for slow networks)
                if (Math.abs(currentSlot - scannedSlot) <= 1) {
                    isValidQR = true;
                }
            } else if (timestamp) {
                const scanTime = parseInt(timestamp);
                if (Math.abs(now - scanTime) <= 35000) { // within 35 seconds
                    isValidQR = true;
                }
            } else if (rawQR) {
                try {
                    const parsed = JSON.parse(rawQR);
                    if (parsed.slot && Math.abs(currentSlot - parseInt(parsed.slot)) <= 1) {
                        isValidQR = true;
                    } else if (parsed.ts && Math.abs(now - parseInt(parsed.ts)) <= 35000) {
                        isValidQR = true;
                    }
                } catch {
                    isValidQR = true;
                }
            }

            if (!isValidQR) {
                return res.status(400).json({
                    verified: false,
                    message: "QR Code Expired. Please scan the live QR code rotating on the projector screen."
                });
            }

            try {
                await AttendanceRecord.create({
                    session: activeSession._id,
                    courseCode: courseCode,
                    studentMatric: studentMatric,
                    verifiedVia: "Dynamic QR Code",
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
                message: "Attendance marked successfully via Dynamic Anti-Proxy QR Code! 🎉",
                verifiedVia: "Dynamic QR Code"
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

        const { faculty: studentFaculty, department: studentDepartment, level: rawLevel } = student;

        if (!studentFaculty || !studentDepartment) {
            return res.status(400).json({
                message: `Student profile incomplete. Faculty/Department missing.`
            });
        }

        // 1. Level Filter: Extract numeric part e.g. "100L" -> "100"
        const studentLevelNum = rawLevel ? rawLevel.trim().replace(/L$/i, '') : '100';
        const levelQuery = {
            level: { $regex: new RegExp(`^${studentLevelNum}(L)?$`, 'i') }
        };

        // 2. Department Filter: Exact match for student department
        const deptQuery = {
            department: { $regex: new RegExp(`^${studentDepartment.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
        };

        // 3. Faculty Filter: Acronym & Full Name
        const fName = studentFaculty.trim();
        const facultyPattern = (fName.toUpperCase() === 'FCI' || /computing/i.test(fName))
            ? '^(FCI|Faculty of Computing.*)$'
            : (fName.toUpperCase() === 'FBAS' || /applied science/i.test(fName))
            ? '^(FBAS|Faculty of Basic.*)$'
            : (fName.toUpperCase() === 'FET' || /engineering/i.test(fName))
            ? '^(FET|Faculty of Engineering.*)$'
            : fName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

        const facultyQuery = {
            faculty: { $regex: new RegExp(facultyPattern, 'i') }
        };

        const activeSessions = await AdminCreateSession.find({
            isSessionActive: true,
            ...facultyQuery,
            ...deptQuery,
            ...levelQuery
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const search = req.query.search
        const searchQuery = search ?{
            $or:[
                {courses:{$regex: search, $option:'i'}},
                {academicSession:{$regex: search, $option:'i'}}
            ]
        }
        :{};

        const total = await AttendanceRecord.countDocuments({ studentMatric: cleanMatric });
        const totalPages = Math.ceil(total / limit)
        const records = await AttendanceRecord.find({ studentMatric: cleanMatric })
            .populate('session')
            .sort({ createdAt: -1 })
            .skip((page- 1) * limit)
            .limit(limit);

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            records,
            totalPages
        });

    } catch (error) {
        console.error("❌ Error fetching attendance:", error);
        return res.status(500).json({
            success: false,
            message: "Server error fetching attendance records."
        });
    }
};

const submitCourseRegistration = async (req, res) => {
    try {
        const student = { id: req.user.id, matricno: req.user.matricno };
        const { academicSession, semester, courses } = req.body;

        // Basic validation
        if (!academicSession || !semester || !courses || !Array.isArray(courses) || courses.length === 0) {
            return res.status(400).json({
                message: 'Please provide academic session, semester, and at least one course.'
            });
        }

        // Check if the student has already registered for this session & semester
        const existingRegistration = await CourseRegistration.findOne({
            studentId: student.id,
            matricno: student.matricno, // ✅ Fixed: Matched schema field name
            academicSession,
            semester,
        });

        if (existingRegistration) {
            return res.status(400).json({
                message: `You have already submitted course registration for ${academicSession} (${semester}).`
            });
        }

        // Calculate total units from the courses array
        const totalUnits = courses.reduce((sum, course) => {
            return sum + (Number(course.unit) || Number(course.units) || 0);
        }, 0);

        // Sanitize course objects to ensure expected shape
        const formattedCourses = courses.map((course) => ({
            courseId: course.courseId || course._id,
            courseCode: course.courseCode,
            courseTitle: course.courseTitle,
            unit: Number(course.unit) || Number(course.units) || 0,
        }));

        // Create new registration record
        const newRegistration = new CourseRegistration({
            studentId: student.id,    // ✅ Fixed: Used student.id
            matricno: student.matricno, // ✅ Added: Included matricno
            academicSession,
            semester,
            courses: formattedCourses,
            totalUnits,
        });

        const savedRegistration = await newRegistration.save();

        return res.status(201).json({
            message: 'Course registration submitted successfully.',
            data: savedRegistration,
        });
    } catch (error) {
        console.error('Course registration error:', error);

        // Handle duplicate key index error (if duplicate submit happens concurrently)
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'Course registration already exists for this semester.',
            });
        }

        return res.status(500).json({
            message: 'Server error while submitting course registration.',
            error: error.message
        });
    }
};

// ── 2. Get Student's Registered Courses ─────────────────────────────────────
const getStudentRegistrations = async (req, res) => {
    try {
        const studentId = req.user.id; // Extracted from JWT token

        const registrations = await CourseRegistration.find({
            studentId,
            status: 'Approved',
        })
            .populate('studentId', 'firstname lastname email matricno department faculty')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: registrations.length,
            data: registrations,
        });
    } catch (error) {
        console.error('Fetch registration error:', error);
        return res.status(500).json({
            message: 'Server error while fetching registered courses.',
            error: error.message
        });
    }
};
// GET /student/my-courses
const getMyCourses = async (req, res) => {
    try {
        // req.user comes from your auth middleware
        const studentId = req.user.id || req.user._id;

        // Fetch all course registrations for this student
        // Populates or includes nested course details if needed
        const registrations = await CourseRegistration.find({ studentId })
            .sort({ createdAt: -1 }); // Latest registrations first

        return res.status(200).json({
            success: true,
            count: registrations.length,
            data: registrations,
        });
    } catch (error) {
        console.error('Error in getMyCourses:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching enrolled courses.',
            error: error.message,
        });
    }
};

const cloud_username = process.env.CLOUDINARY_CLOUD_NAME;
const api_userkey = process.env.CLOUDINARY_API_KEY;
const api_usersecret = process.env.CLOUDINARY_API_SECRET;

const cloudinary_config = cloudinary.config({
    cloud_name: cloud_username,
    api_key: api_userkey,
    api_secret: api_usersecret,
});

console.log(cloudinary_config);




const uploadProfilePicture = async (req, res) => {
    try {
        const { image } = req.body; // Base64 string sent from client

        if (!image) {
            return res.status(400).json({
                success: false,
                message: "No image string provided in request body.",
            });
        }

        // Cloudinary natively accepts Base64 Data URIs
        const uploadResult = await cloudinary.uploader.upload(image, {
            folder: "student_profiles",
        });

        const profilePictureUrl = uploadResult.secure_url;
        const publicId = uploadResult.public_id;
        console.log(profilePictureUrl);

        // Update MongoDB
        const userId = req.user.id || req.user._id;
        const updateStudent = await StudentModel.findByIdAndUpdate(
            userId,
            { profilePicture: profilePictureUrl },
            { returnDocument: 'after' }
        );
        console.log(updateStudent);
        return res.status(200).json({
            success: true,
            message: "Profile picture uploaded successfully!",
            data: updateStudent, profilePictureUrl
        });

    } catch (error) {
        console.error("❌ Upload error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error uploading profile picture.",
            error: error.message,
        });
    }
};



const requestStudentPasswordReset = async (req, res) => {
    try {
        const { identifier } = req.body; // matricno or email
        if (!identifier) {
            return res.status(400).json({ message: "Matric number or email is required." });
        }

        const cleanIdentifier = identifier.trim();
        const student = await StudentModel.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${cleanIdentifier}$`, 'i') } },
                { matricno: cleanIdentifier }
            ]
        });

        if (!student) {
            // Intelligent cross-check: Check if this email is registered as an Admin/Lecturer instead
            const admin = await AdminModel.findOne({ email: { $regex: new RegExp(`^${cleanIdentifier}$`, 'i') } });
            if (admin) {
                return res.status(404).json({
                    message: "This email belongs to a Lecturer/Admin account. Please switch to the 'Lecturer / Admin' tab to reset your password."
                });
            }
            return res.status(404).json({ message: "No student account found with this email or matric number." });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await PasswordReset.deleteMany({ identifier: student.email.toLowerCase() });
        await PasswordReset.create({
            identifier: student.email.toLowerCase(),
            userType: 'student',
            otp,
            expiresAt
        });

        return res.status(200).json({
            success: true,
            message: `Password reset OTP generated. Valid for 15 minutes.`,
            otp: otp, // In dev/demo environment returned directly for instant recovery
            email: student.email
        });
    } catch (err) {
        console.error("Password reset request error:", err);
        return res.status(500).json({ message: "Server error processing request." });
    }
};

const resetStudentPassword = async (req, res) => {
    try {
        const { identifier, otp, newPassword, confirmPassword } = req.body;
        if (!identifier || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required." });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters." });
        }

        const student = await StudentModel.findOne({
            $or: [
                { email: identifier.trim().toLowerCase() },
                { matricno: identifier.trim() }
            ]
        });

        if (!student) {
            return res.status(404).json({ message: "Student record not found." });
        }

        const resetDoc = await PasswordReset.findOne({
            identifier: student.email.toLowerCase(),
            otp: otp.trim(),
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!resetDoc) {
            return res.status(400).json({ message: "Invalid or expired OTP code. Please request a new code." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        student.password = hashedPassword;
        await student.save();

        resetDoc.used = true;
        await resetDoc.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successfully! You can now sign in with your new password."
        });
    } catch (err) {
        console.error("Reset password error:", err);
        return res.status(500).json({ message: "Server error resetting password." });
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
    myAttendance,
    submitCourseRegistration,
    getStudentRegistrations,
    getMyCourses,
    uploadProfilePicture,
    requestStudentPasswordReset,
    resetStudentPassword
};