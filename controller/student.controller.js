const StudentModel = require('../model/student.model')
const AdminCreateSession = require('../model/adminCreateSession.model')
const bcrypt = require('bcryptjs')
const { Resend } = require('resend')
const jwt = require('jsonwebtoken')
const resend = new Resend(process.env.RESEND_API_KEY);
const AttendanceRecord = require('../model/attendanceRecord.model')

const register = async (req, res) => {
    console.log(req.body)
    const { firstname, lastname, email, matricno, faculty, department, password, confirmpassword } = req.body
    const form = new StudentModel(req.body)
    const findOne = await StudentModel.findOne({ matricno: req.body.matricno })
    if (findOne) {
        return res.status(400).json({ message: "Matric number already exists" })
    }
    const findEmail = await StudentModel.findOne({ email: req.body.email })
    if (findEmail) {
        return res.status(400).json({ message: "Email already exists" })
    }
    form.save()
        .then(async (result) => {
            console.log('register successful', result)
            if (result) {
                console.log(result)
                const { data, error } = await resend.emails.send({
                    from: "onboarding@resend.dev", // Resend requires this for testing
                    to: email,
                    subject: "Hello",
                    html: `<p>Congrats ${firstname} on signing up</p>`
                });
                res.render('/signin')
            }
            return
        })
        .catch((err) => {
            console.log(err)
        })
    res.json({ message: 'Registration successful', data: req.body })
}

const signin = (req, res) => {
    res.render('/signin')
}

const login = async (req, res) => {
    try {
        const student = await StudentModel.findOne({ matricno: req.body.matricno })
        if (!student) {
            return res.status(404).json({ message: "Student not found" })
        }

        const verifyPassword = await bcrypt.compare(req.body.password, student.password)
        if (!verifyPassword) {
            return res.status(401).json({ message: "Invalid password" })
        } else {
            const payload = {
                id: student._id,
                firstname: student.firstname,
                lastname: student.lastname,
                email: student.email,
                matricno: student.matricno,
                faculty: student.faculty,
                department: student.department,
            }
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })
            res.json({ message: 'Sign in successful', data: { id: student._id }, token: token })
        }
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal server error" })
    }
}

const dashboard = async (req, res) => {
    const authHeader = req.headers.authorization
    console.log(authHeader)
    const token = authHeader.split(' ')[1]
    console.log(token)
    jwt.verify(token, process.env.JWT_SECRET, async (err, authUser) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" })
        }
        try {
            const user = await StudentModel.findOne({ matricno: authUser.matricno });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({
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
            res.status(500).json({ message: "Server error" });
        }
    })
}

const verifyStudentLocation = async (req, res) => {
    try {
        // 1. Extract and check the Authorization Header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        // 🧹 Clean up any potential client-side line breaks (\n, \r) or multi-spaces down into a clean single space
        const cleanHeader = authHeader.replace(/[\r\n]+/g, ' ').trim();

        if (!cleanHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Access denied. Invalid token formatting prefix." });
        }

        // Safely extract the sanitized signature token payload string
        const token = cleanHeader.split(' ')[1];

        // 2. Synchronous JWT Verification
        let authUser;
        try {
            authUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.error("❌ JWT Signature Verification Failed:", jwtError.message);
            return res.status(401).json({ message: "Invalid or expired token structure." });
        }

        console.log("🕵️‍♂️ Decoded authUser payload:", authUser);

        // 3. Identification Fallback Extractors
        // 🔐 AUTHENTICATION IDENTITY EXTRACTION
        // Use the decoded `authUser` object we got from jwt.verify!
        const studentMatric = authUser?.matricno || authUser?.id || authUser?._id;

        if (!studentMatric) {
            return res.status(401).json({
                message: "Unauthorized. Student identification missing from token."
            });
        }
        // 4. Destructure the request body parameters
        console.log("📥 Incoming Student Payload:", req.body);
        const {
            studentLatitude,
            studentLongitude,
            courseCode,
            scannedBssid,
            scannedUuid,
            verificationMethodChosen
        } = req.body;

        // Dynamic Validation
        if (!courseCode) {
            return res.status(400).json({ message: "Course code is required." });
        }

        if (verificationMethodChosen === 'gps' || (!scannedBssid && !scannedUuid)) {
            if (studentLatitude === undefined || studentLongitude === undefined) {
                return res.status(400).json({
                    message: "GPS Verification requires active Latitude and Longitude.",
                });
            }
        }

        // 5. Look up active session
        const activeSession = await AdminCreateSession.findOne({
            courseCode: courseCode,
            isSessionActive: true,
        }).sort({ createdAt: -1 });

        if (!activeSession) {
            return res.status(404).json({
                message: "No active attendance session found for this course.",
            });
        }

        // ⏱️ STEP 2: TIME RANGE / EXPIRATION CHECK 
        // Checks if the current time has passed the allowed duration (e.g., 1 hour since creation)
        const sessionDurationLimit = 60 * 60 * 1000; // 1 Hour in milliseconds
        const currentTime = new Date();
        const sessionAge = currentTime - new Date(activeSession.createdAt);

        if (sessionAge > sessionDurationLimit) {
            activeSession.isSessionActive = false;
            await activeSession.save();

            // 🚨 TRIGGER ABSENTEE GENERATOR
            await markAbsentees(activeSession._id, activeSession.courseCode);

            return res.status(410).json({
                verified: false,
                message: "This attendance session has expired and is now closed.",
            });
        }

        // 6. Hardware Verification Strategy (Code continues as normal below...)
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

        // Success Path A: Hardware Match
        if (verifiedViaHardware) {
            console.log(`\n✅ [ATTENDANCE SUCCESS] Student ${studentMatric} verified via Hardware Lock for ${courseCode}\n`);

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

        // Hardware fail response
        if (verificationMethodChosen === 'wifi' || verificationMethodChosen === 'beacon') {
            return res.status(400).json({
                verified: false,
                message: "Hardware verification failed. You are not connected to the classroom router or near the beacon.",
                status: "Absent"
            });
        }

        // 7. Fallback: Haversine Calculation (GPS)
        const lat1 = parseFloat(studentLatitude) || 0;
        const lon1 = parseFloat(studentLongitude) || 0;
        const lat2 = parseFloat(activeSession.latitude) || 0;
        const lon2 = parseFloat(activeSession.longitude) || 0;

        const allowedRadius = 200;
        const R = 6371e3; // Earth's radius in meters
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) *
            Math.cos(phi2) *
            Math.sin(deltaLambda / 2) *
            Math.sin(deltaLambda / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const calculatedDistance = R * c;

        // Success Path B: GPS Match
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
                message: `You are out of bounds. You are ${calculatedDistance.toFixed(1)} meters away from the lecture venue.`,
                distance: calculatedDistance,
                status: "Absent"
            });
        }

    } catch (globalError) {
        console.error("❌ Verification Route Error:", globalError);
        return res.status(500).json({ message: "Internal server error during verification." });
    }
};


const getActiveSessionsForStudent = async (req, res) => {
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

        // 1. Verify the JWT Token directly to get the student's ID
        let decodedStudent;
        try {
            decodedStudent = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: "Invalid or expired token." });
        }

        // Use 'id' or '_id' from the decoded token payload
        const studentId = decodedStudent.id || decodedStudent._id;

        // 2. Look up the student directly in the database to get fresh faculty/department data
        const student = await StudentModel.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Student profile not found in database." });
        }

        const studentFaculty = student.faculty;
        const studentDepartment = student.department;

        if (!studentFaculty || !studentDepartment) {
            return res.status(400).json({
                message: `Your student profile is missing department or faculty in the database. (Found - Dept: ${studentDepartment || 'None'}, Faculty: ${studentFaculty || 'None'})`
            });
        }

        // 3. Query active sessions matching the student's faculty and department
        const now = new Date();
        // 3. Match flexibly using partial search keywords
        const activeSessions = await AdminCreateSession.find({
            isSessionActive: true,
            dateTimeTo: { $gt: now },
            faculty: {
                $regex: new RegExp(studentFaculty.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') // Removed exact ^ and $ bounds
            },
            department: {
                $regex: new RegExp(studentDepartment.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') // Removed exact ^ and $ bounds
            }
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            sessions: activeSessions,
            activeSessions: activeSessions,
            data: activeSessions
        });

    } catch (error) {
        console.error("❌ Error fetching filtered sessions:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const markAbsentees = async (sessionId, courseCode, department) => {
    try {
        console.log(`🧹 Processing absentees for session ${sessionId} in ${department}...`);

        // 🚨 1. Fetch only students registered in this specific department!
        const allStudents = await StudentModel.find({ department: department }, 'matricno');
        const allMatricNumbers = allStudents.map(student => student.matricno);

        // 2. Get students who are already marked "Present"
        const presentRecords = await AttendanceRecord.find({ session: sessionId }, 'studentMatric');
        const presentMatricNumbers = presentRecords.map(record => record.studentMatric);

        // 3. Filter out who is missing
        const absentMatricNumbers = allMatricNumbers.filter(
            matric => !presentMatricNumbers.includes(matric)
        );

        if (absentMatricNumbers.length === 0) {
            console.log(`🎉 Perfect attendance for ${department}!`);
            return;
        }

        // 4. Prepare and bulk insert
        const absenteeRecords = absentMatricNumbers.map(matric => ({
            session: sessionId,
            courseCode: courseCode,
            studentMatric: matric,
            verifiedVia: "None",
            status: "Absent"
        }));

        await AttendanceRecord.insertMany(absenteeRecords, { ordered: false });
        console.log(`Saved ${absenteeRecords.length} absences for ${department}.`);

    } catch (error) {
        if (error.code !== 11000) {
            console.error("❌ Error marking department absentees:", error);
        }
    }
};

const myAttendance = async (req, res) => {
    try {
        console.log("🔍 Debug Controller req.user:", req.user);

        // Try getting the ID from req.user
        // const studentId = req.user?.id || req.user?._id;
        const studentMatric = req.user?.matricno;

        console.log("🔍 Debug Controller Extracted matricNo:", studentMatric);

        if (!studentMatric) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Student matricNo missing from token.",
                debugReqUser: req.user // Echoes back payload to Postman
            });
        }

        // Fetch records from DB
        const records = await AttendanceRecord.find({ student: studentMatric }).sort({ createdAt: -1 });

        console.log(`✅ Debug Controller Found ${records.length} records for studentId ${studentMatric}`);

        return res.status(200).json({ success: true, records });

    } catch (error) {
        console.error("❌ Debug Controller Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error fetching attendance.",
            errorDetails: error.message
        });
    }
};

module.exports = { register, signin, login, dashboard, verifyStudentLocation, getActiveSessionsForStudent, markAbsentees, myAttendance }