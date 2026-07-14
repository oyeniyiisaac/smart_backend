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
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // Adjust duration as needed

            // Turn off any sessions older than 1 hour that are still marked active
            const result = await AdminCreateSession.updateMany(
                {
                    isSessionActive: true,
                    createdAt: { $lt: oneHourAgo }
                },
                {
                    isSessionActive: false
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`🧹 [AUTO-CLEANUP] Closed ${result.modifiedCount} expired attendance sessions.`);
            }
        } catch (err) {
            console.error("❌ Auto-Cleanup Cron Error:", err);
        }
    });
    console.log("⏰ Attendance auto-cleanup cron job initialized.");
}

app.listen(port, () => {
    console.log(port)
})
