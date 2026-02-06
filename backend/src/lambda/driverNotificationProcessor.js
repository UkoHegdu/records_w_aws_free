// lambda/driverNotificationProcessor.js - Backend: no-op (daily job runs via POST /api/v1/cron/daily)
exports.handler = async (event, context) => {
    console.log('🔄 Driver Notification Processor (backend): use POST /api/v1/cron/daily', event);
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Backend uses POST /api/v1/cron/daily for daily emails and driver notifications.',
            processedMessages: 0
        })
    };
};
