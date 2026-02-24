// lambda/checkJobStatus.js (backend: in-memory only; no AWS)
const mapSearchJobStore = require('../mapSearchJobStore');

exports.handler = async (event, context) => {
    console.log('🔍 checkJobStatus triggered!', event);

    const { jobId } = event.pathParameters || {};

    if (!jobId) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ error: 'Job ID parameter required' })
        };
    }

    try {
        const job = await mapSearchJobStore.get(jobId);
        if (!job) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({ error: 'Job not found' })
            };
        }

        const response = {
            jobId: job.job_id,
            status: job.status,
            username: job.username,
            period: job.period,
            created_at: job.created_at,
            updated_at: job.updated_at
        };
        if (job.status === 'completed' && job.result) response.result = job.result;
        if (job.status === 'failed' && job.error_message) response.error = job.error_message;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.error('Error checking job status:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
