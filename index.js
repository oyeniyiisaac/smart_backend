const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cron = require('node-cron');
const mongoose = require('mongoose')
const URL = process.env.MONGO_URL
const port = process.env.port
const UserRoute = require('./routes/student.route')
const AdminRoute = require('./routes/adminlog.route')
const AdminCreateSession = require('./model/adminCreateSession.model')
const { markAbsentees } = require('./controller/student.controller'); // Adjust path to your controller
app.use(express.urlencoded({limit: '50mb', extended: true }))
app.use(express.json({ limit: '50mb' }))
app.use(cors())

app.use('/', UserRoute)
app.use('/admin', AdminRoute)
require('./autoapprove')

mongoose.connect(URL)
    .then(() => {
        console.log('MongoDB connected');
        console.log()
    })
    .catch((err) => {
        console.log(err);
    })


// Automated Session Expiration & Absentee Cleanup Cron Job (Runs every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
    try {
        console.log("⏰ Running automated session expiration checker...");

        const sessionDurationLimit = 60 * 60 * 1000; // 1 Hour limit
        const cutoffTime = new Date(Date.now() - sessionDurationLimit);

        // Find active sessions older than 1 hour
        const expiredSessions = await AdminCreateSession.find({
            isSessionActive: true,
            createdAt: { $lt: cutoffTime }
        });

        if (expiredSessions.length === 0) {
            return;
        }

        for (const session of expiredSessions) {
            console.log(`⏳ Auto-closing expired session: ${session.courseCode} (${session.department})`);

            // Mark session inactive
            session.isSessionActive = false;
            await session.save();

            // Run absent generator
            await markAbsentees(session._id, session.courseCode, session.department);
        }
        console.log("✅ Auto-cleanup and absentee run finished successfully.");
    } catch (error) {
        console.error("❌ Error in session cleanup cron job:", error);
    }
});
app.listen(port, () => {
    console.log("The is a server running")
})
