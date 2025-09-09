// lambda/getMapRecords.js
const axios = require('axios');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize Lambda client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry failed requests
const fetchWithRetry = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await sleep(1000 * (i + 1)); // Exponential backoff
        }
    }
};

// Filter records by period
const filterRecordsByPeriod = (data, period) => {
    const now = Date.now();
    let timeThreshold;

    switch (period) {
        case '1d':
            timeThreshold = 24 * 60 * 60 * 1000; // 1 day
            break;
        case '1w':
            timeThreshold = 7 * 24 * 60 * 60 * 1000; // 1 week
            break;
        case '1m':
            timeThreshold = 30 * 24 * 60 * 60 * 1000; // 1 month
            break;
        default: w
            return data; // Return all records if period is not specified
    }

    return data.map(group => ({
        ...group,
        tops: group.tops?.filter(record => {
            const recordTime = new Date(record.timestamp).getTime();
            return now - recordTime <= timeThreshold;
        }) || []
    })).filter(group => group.tops?.length > 0) || [];
};

// Get records from Trackmania API with authentication
const getRecordsFromApi = async (mapUid, accessToken) => {
    const url = `https://prod.trackmania.core.nadeo.online/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `nadeo_v1 t=${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error fetching records from Trackmania API:', error.message);
        throw new Error('Failed to fetch records from API');
    }
};

// Call the authentication Lambda to get a valid access token
const getValidAccessToken = async () => {
    try {
        const command = new InvokeCommand({
            FunctionName: process.env.AUTH_SERVICE_FUNCTION_NAME,
            Payload: JSON.stringify({ action: 'getValidToken' })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));

        if (result.statusCode === 200) {
            const body = JSON.parse(result.body);
            return body.accessToken;
        } else {
            throw new Error('Failed to get access token from auth service');
        }
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
    }
};

exports.handler = async (event, context) => {
    console.log('🔥 getMapRecords Lambda triggered!', event);

    // Parse query parameters
    const { mapUid, period } = event.queryStringParameters || {};

    if (!mapUid || !period) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ error: 'Missing required query parameters: mapUid or period' })
        };
    }

    try {
        console.log(`Fetching records for mapUid: ${mapUid}, period: ${period}`);

        // Get a valid access token from the auth service
        const accessToken = await getValidAccessToken();

        // Fetch the leaderboard data from the external API
        const leaderboardData = await getRecordsFromApi(mapUid, accessToken);

        // Filter the data by the period specified by the user (day/week/month)
        const filteredRecords = filterRecordsByPeriod(leaderboardData, period);

        console.log(`Found ${filteredRecords.length} filtered records`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify(filteredRecords)
        };

    } catch (error) {
        console.error('Error fetching leaderboard data:', error.message);
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
