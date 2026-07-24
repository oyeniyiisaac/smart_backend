const cron = require('node-cron');
const CourseRegistration = require('./model/submitCourseReg.model');

// Runs every night at midnight (00:00)
// Tip: If you want it to run every hour instead of just at midnight, change '0 0 * * *' to '0 * * * *'
cron.schedule('0 0 * * *', async () => {
    try {
        // Calculate cutoff timestamp (1 hour ago)
        const ONE_HOUR_MS = 1 * 60 * 60 * 1000;
        const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

        // Auto-approve all Pending registrations created > 1 hour ago
        const result = await CourseRegistration.updateMany(
            { 
                status: 'Pending', 
                createdAt: { $lte: oneHourAgo } 
            },
            { 
                $set: { status: 'Approved' } 
            }
        );

        console.log(`[CRON AUTO-APPROVE] Auto-approved ${result.modifiedCount} course registration(s).`);
    } catch (error) {
        console.error('Error in auto-approval cron job:', error);
    }
});