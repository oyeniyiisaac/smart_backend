const cron = require('node-cron');
const CourseRegistration = require('./model/submitCourseReg.model');

// Runs every night at midnight
cron.schedule('0 0 * * *', async () => {
    try {
        // Calculate cutoff timestamp (e.g., 48 hours ago)
        const twoDaysAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

        // Find all "Pending" registrations created more than 48 hours ago
        const result = await CourseRegistration.updateMany(
            { status: 'Pending', createdAt: { $lte: twoDaysAgo } },
            { $set: { status: 'Approved' } }
        );

        console.log(`Auto-approved ${result.modifiedCount} course registrations.`);
    } catch (error) {
        console.error('Error in auto-approval cron job:', error);
    }
});