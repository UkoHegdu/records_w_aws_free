// lambda/mapSearch.js
const axios = require('axios');
const apiClient = require('./shared/apiClient');

// Helper function for retry logic
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const RETRY_LIMIT = 5;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

const fetchWithRetry = async (fn, retries = RETRY_LIMIT) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error?.response?.data || error.message);
            if (attempt === retries) throw error;
            console.log(`Waiting ${RETRY_DELAY_MS / 60000} minutes before retrying...`);
            await sleep(RETRY_DELAY_MS);
        }
    }
};

// Filter records by period (copied from backend/services/filter.js)
const filterRecordsByPeriod = (data, period = '1d') => {
    const now = Date.now();
    let timeThreshold;

    switch (period) {
        case '1d':
            timeThreshold = 24 * 60 * 60 * 1000;
            break;
        case '1w':
            timeThreshold = 7 * 24 * 60 * 60 * 1000;
            break;
        case '1m':
            timeThreshold = 30 * 24 * 60 * 60 * 1000;
            break;
        default:
            return [];
    }

    return data.tops?.flatMap(group =>
        group.top?.filter(record => {
            const recordTime = record.timestamp * 1000;
            return now - recordTime <= timeThreshold;
        }) || []
    ) || [];
};

// Get records from Trackmania API using the shared API client
const getRecordsFromApi = async (mapUid) => {
    const baseUrl = process.env.LEAD_API;
    const url = `${baseUrl}/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;

    try {
        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching records from Trackmania API:', error.message);
        throw new Error('Failed to fetch records from API');
    }
};


const fetchMapsAndLeaderboards = async (username, period = null) => {
    console.log('fetching maps and leaderboards');

    const baseUrl = `https://trackmania.exchange/api/maps`;
    const params = {
        author: username,
        fields: 'Name,MapId,MapUid,Authors'
    };

    const allResults = [];

    await fetchWithRetry(async () => {
        let hasMore = true;
        let lastMapId = null;

        while (hasMore) {
            const queryParams = new URLSearchParams(params);
            if (lastMapId) queryParams.append('after', lastMapId);

            const url = `${baseUrl}?${queryParams.toString()}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data?.Results?.length > 0) {
                allResults.push(...data.Results);
                lastMapId = data.Results[data.Results.length - 1].MapId;
            }

            hasMore = data.More;
            console.log('viena lapa pabeigta ayoo');
        }
    });

    const mapsAndLeaderboards = [];

    for (const map of allResults) {
        const leaderboard = await fetchWithRetry(() => getRecordsFromApi(map.MapUid));
        const filtered = period ? filterRecordsByPeriod(leaderboard, period) : leaderboard;

        if (filtered.length > 0) {
            mapsAndLeaderboards.push({
                mapName: map.Name,
                leaderboard: filtered
            });
        }

        await sleep(500); // TM DOC specified, do not change
    }

    return mapsAndLeaderboards;
};

// Export the function for use by scheduler
exports.fetchMapsAndLeaderboards = fetchMapsAndLeaderboards;

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
    console.log('🗺️ mapSearch Lambda triggered!', event);

    const { username, period } = event.queryStringParameters || {};
    console.log('📝 Extracted parameters:', { username, period });

    if (!username) {
        console.log('❌ No username provided');
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ error: 'Username parameter required' })
        };
    }

    console.log('✅ Username validation passed, starting job creation...');

    try {
        // Generate unique job ID
        const jobId = uuidv4();
        console.log('🆔 Generated job ID:', jobId);

        // Store job in DynamoDB with pending status
        const jobItem = {
            job_id: jobId,
            username: username,
            period: period || '1d',
            status: 'pending',
            created_at: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
        };
        console.log('💾 Job item to store:', jobItem);
        console.log('🗄️ Table name:', process.env.MAP_SEARCH_RESULTS_TABLE_NAME);

        await dynamoClient.send(new PutItemCommand({
            TableName: process.env.MAP_SEARCH_RESULTS_TABLE_NAME,
            Item: marshall(jobItem)
        }));
        console.log('✅ Job stored in DynamoDB successfully');

        // Trigger background processing Lambda
        console.log('🚀 Invoking background Lambda:', process.env.MAP_SEARCH_BACKGROUND_FUNCTION_NAME);
        await lambdaClient.send(new InvokeCommand({
            FunctionName: process.env.MAP_SEARCH_BACKGROUND_FUNCTION_NAME,
            InvocationType: 'Event', // Async invocation
            Payload: JSON.stringify({
                jobId: jobId,
                username: username,
                period: period
            })
        }));
        console.log('✅ Background Lambda invoked successfully');

        // Return job ID immediately
        const response = {
            statusCode: 202, // Accepted
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                jobId: jobId,
                status: 'pending',
                message: 'Map search started. Use the job ID to check status.'
            })
        };
        console.log('📤 Returning response:', response);
        return response;
    } catch (error) {
        console.error('Error starting map search job:', error);
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