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
    if(findOne || findEmail){
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

module.exports = { register, signin, login, dashboard }
