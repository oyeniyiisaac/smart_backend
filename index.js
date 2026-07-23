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
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cors())
app.use('/', UserRoute)
app.use('/admin', AdminRoute)

mongoose.connect(URL)
    .then(() => {
        console.log('MongoDB connected');
        console.log()
    })
    .catch((err) => {
        console.log(err);
    })


function startCleanupJob() {
    // Run every 5 minutes to check for expired sessions
    cron.schedule('*/5 * * * *', async () => {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // Adjust session limit as needed
            
            // 1. Find all active sessions that have been open for longer than 1 hour
            const expiredSessions = await AdminCreateSession.find({ 
                isSessionActive: true, 
                createdAt: { $lt: oneHourAgo } 
            });

            if (expiredSessions.length > 0) {
                console.log(`🧹 Found ${expiredSessions.length} expired session(s) to close.`);
                
                // 2. Loop through each expired session to close it and record absences
                for (const session of expiredSessions) {
                    session.isSessionActive = false;
                    await session.save();

                    console.log(`🔒 Closed expired session for ${session.courseCode}. Processing absentees...`);
                    
                    // 3. Trigger the absentee generator for this specific session
                    await markAbsentees(session._id, session.courseCode);
                }
                console.log("✅ Auto-cleanup and absentee run finished successfully.");
            }
            
        } catch (err) {
            console.error("❌ Auto-Cleanup Cron Error:", err);
        }
    });
    console.log("⏰ Attendance auto-cleanup cron job initialized.");
}
cron.schedule('*/5 * * * *', async () => {
    try {
        console.log("⏰ Running automated session expiration checker...");

        const sessionDurationLimit = 60 * 60 * 1000; // 1 Hour limit
        const cutoffTime = new Date(Date.now() - sessionDurationLimit);

        // Find active sessions older than 1 hour or past dateTimeTo
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

    } catch (error) {
        console.error("❌ Error in session cleanup cron job:", error);
    }
});
app.listen(port, () => {
    console.log(port)
})
