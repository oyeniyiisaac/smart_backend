const StudentModel = require('../model/student.model')
const bcrypt = require('bcryptjs')
const { Resend } = require('resend')
const jwt = require('jsonwebtoken')
const resend = new Resend(process.env.RESEND_API_KEY);
const register = async (req, res) => {
    console.log(req.body)
    const { firstname, lastname, email, matricno, password, confirmpassword } = req.body
    const form = new StudentModel(req.body)
    const findOne = await StudentModel.findOne({ matricno: req.body.matricno })
    const findEmail = await StudentModel.findOne({ email: req.body.email })
    if (findOne || findEmail) {
        return res.status(404).json({ message: "Student already exists" })
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
    // res.send(req.body)
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
                matricno: student.matricno
            }
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })
            res.json({ message: 'Sign in successful', data: { id: student._id }, token: token })
            // console.log(token)
        }
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal server error" })
    }
}

const dashboard = async (req, res) => {
    // const authUser = req.user.authorization
    // console.log(authUser.id )
    // const authMatricno = authUser.matricno
    const authHeader = req.headers.authorization
    console.log(authHeader)
    const token = authHeader.split(' ')[1]
    console.log(token)
    jwt.verify(token, process.env.JWT_SECRET, async (err, authUser) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" })
        }
        try {
            const user = await StudentModel.findOne({ matricno: authUser.matricno }); // adjust to your model/ORM
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({
                message: "Dashboard",
                result: {
                    firstname: user.firstname,
                    matricno: user.matricno,
                    // any other fields you want on the dashboard
                },
            });
        } catch (error) {
            res.status(500).json({ message: "Server error" });
        }
    })
}

// const dashboard = async (req, res) => {
//     const authHeader = req.headers.authorization;
//     const token = authHeader.split(" ")[1];

//     jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
//         if (err) {
//             return res.status(401).json({ message: "Invalid token" });
//         }
//         try {
//             const user = await User.findOne({ matricno: decoded.matricno }); // adjust to your model/ORM
//             if (!user) {
//                 return res.status(404).json({ message: "User not found" });
//             }
//             res.json({
//                 message: "Dashboard",
//                 result: {
//                     firstname: user.firstname,
//                     matricno: user.matricno,
//                     // any other fields you want on the dashboard
//                 },
//             });
//         } catch (error) {
//             res.status(500).json({ message: "Server error" });
//         }
//     });
// };
const verifyStudentLocation = async (req, res) => {
    try {
        // 1. Get the student's current GPS reading AND the course they are checking into
        const { studentLatitude, studentLongitude, courseCode } = req.body;

        if (!studentLatitude || !studentLongitude || !courseCode) {
            return res.status(400).json({
                message:
                    "Missing required fields. Latitude, longitude, and course code are required.",
            });
        }

        // 2. Look up the ACTIVE session inside MongoDB instead of config.json
        // (Assuming your model name is AdminCreateSession)
        const activeSession = await AdminCreateSession.findOne({
            courseCode: courseCode,
            isSessionActive: true,
        }).sort({ createdAt: -1 }); // Gets the most recently created one if duplicates exist

        if (!activeSession) {
            return res.status(404).json({
                message: "No active attendance session found for this course.",
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

        const a =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) *
            Math.cos(phi2) *
            Math.sin(deltaLambda / 2) *
            Math.sin(deltaLambda / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const calculatedDistance = R * c; // Distance in meters

        // 4. DEBUG LOGGING - Check your terminal terminal to see the variance!
        console.log(`\n--- [ATTENDANCE CHECK] ---`);
        console.log(`Course Code:     ${courseCode}`);
        console.log(
            `Student GPS:     Lat ${lat1.toFixed(6)}, Lon ${lon1.toFixed(6)}`,
        );
        console.log(
            `Database Target: Lat ${lat2.toFixed(6)}, Lon ${lon2.toFixed(6)}`,
        );
        console.log(`Calculated Gap:  ${calculatedDistance.toFixed(2)} meters`);
        console.log(`Allowed Radius:  ${allowedRadius} meters`);
        console.log(`--------------------------\n`);

        // 5. Evaluation
        if (calculatedDistance <= allowedRadius) {
            return res.status(200).json({
                verified: true,
                message: "Location verified successfully! Attendance marked.",
                distance: calculatedDistance,
            });
        } else {
            return res.status(400).json({
                verified: false,
                message: `You are out of bounds. You are ${calculatedDistance.toFixed(1)} meters away from the lecture venue.`,
                distance: calculatedDistance,
            });
        }
    } catch (globalError) {
        console.error("❌ Verification Route Error:", globalError);
        return res
            .status(500)
            .json({ message: "Internal server error during verification." });
    }
};

module.exports = { register, signin, login, dashboard, verifyStudentLocation }
