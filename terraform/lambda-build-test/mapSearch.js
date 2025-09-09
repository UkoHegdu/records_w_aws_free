// lambda/mapSearch.js
const axios = require('axios');

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
    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

    try {
        const command = new InvokeCommand({
            FunctionName: process.env.AUTH_SERVICE_FUNCTION_NAME,
            Payload: JSON.stringify({ action: 'getValidToken' })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(Buffer.from(response.Payload).toString());

        if (result.statusCode === 200) {
            const body = JSON.parse(result.body);
            return body.accessToken;
        } else {
            throw new Error('Failed to get access token from auth service');
        }
    } catch (error) {
        console.error('Error calling auth service:', error);
        throw error;
    }
};

const fetchMapsAndLeaderboards = async (username, period = null) => {
    console.log('fetching maps and leaderboards');

    // Get a valid access token from the auth service
    const accessToken = await getValidAccessToken();

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
        const leaderboard = await fetchWithRetry(() => getRecordsFromApi(map.MapUid, accessToken));
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

exports.handler = async (event, context) => {
    console.log('🗺️ mapSearch Lambda triggered!', event);

    const { username, period } = event.queryStringParameters || {};

    if (!username) {
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

    try {
        const result = await fetchMapsAndLeaderboards(username, period);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error fetching maps and leaderboards:', error);
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