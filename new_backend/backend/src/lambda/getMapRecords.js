// lambda/getMapRecords.js
const apiClient = require('./shared/apiClient');

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
        default:
            return data; // Return all records if period is not specified
    }

    // Handle the Trackmania API response structure
    if (!data || !Array.isArray(data)) {
        console.log('Data is not an array, returning as-is:', typeof data);
        return data || [];
    }

    return data.map(group => ({
        ...group,
        tops: group.tops?.filter(record => {
            const recordTime = new Date(record.timestamp).getTime();
            return now - recordTime <= timeThreshold;
        }) || []
    })).filter(group => group.tops?.length > 0) || [];
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

        // Fetch the leaderboard data from the external API (token handling is automatic)
        const leaderboardData = await getRecordsFromApi(mapUid);
        console.log('Raw API response:', JSON.stringify(leaderboardData, null, 2));

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
