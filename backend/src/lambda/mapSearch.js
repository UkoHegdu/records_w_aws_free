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
        const filtered = filterRecordsByPeriod(leaderboard, period || '1d');

        if (filtered.length > 0) {
            mapsAndLeaderboards.push({
                mapId: map.MapId,
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

const { v4: uuidv4 } = require('uuid');
const mapSearchJobStore = require('../mapSearchJobStore');
const mapSearchBackground = require('./mapSearchBackground');

// Rate limiting: Track user requests per minute
const userRequestCounts = new Map();
const RATE_LIMIT_PER_MINUTE = 2; // Allow 2 requests per minute per user

const isRateLimited = (username) => {
    const now = Date.now();
    const userKey = username.toLowerCase();

    if (!userRequestCounts.has(userKey)) {
        userRequestCounts.set(userKey, []);
    }

    const requests = userRequestCounts.get(userKey);

    // Remove requests older than 1 minute
    const oneMinuteAgo = now - 60000;
    const recentRequests = requests.filter(timestamp => timestamp > oneMinuteAgo);

    if (recentRequests.length >= RATE_LIMIT_PER_MINUTE) {
        return true;
    }

    // Add current request
    recentRequests.push(now);
    userRequestCounts.set(userKey, recentRequests);

    return false;
};

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

    // Check rate limiting
    if (isRateLimited(username)) {
        console.log(`🚫 Rate limit exceeded for user: ${username}`);
        return {
            statusCode: 429,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Rate limit exceeded. Please wait before making another request.',
                retryAfter: 60
            })
        };
    }

    console.log('✅ Username validation passed, starting job creation...');

    try {
        const jobId = uuidv4();
        console.log('🆔 Generated job ID:', jobId);

        // Postgres or in-memory store + in-process background (backend has no AWS)
        await mapSearchJobStore.create(jobId, username, period || '1d');
        setImmediate(() => {
            mapSearchBackground.handler({
                Records: [{ body: JSON.stringify({ jobId, username, period: period || '1d' }) }]
            }).catch(err => console.error('Map search background error:', err));
        });

        const response = {
            statusCode: 202,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                jobId,
                status: 'pending',
                message: 'Map search queued. Use the job ID to check status.',
                estimatedWaitTime: '1–3 minutes (in-process)'
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