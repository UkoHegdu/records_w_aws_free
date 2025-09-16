// lambda/mapSearchBackground.js
const axios = require('axios');
const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { translateAccountNames } = require('./accountNames');
const apiClient = require('./shared/apiClient');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// No retry logic for testing - fail immediately

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

    // Handle the Trackmania API response structure
    if (!data || !data.tops) {
        console.log('Data structure issue, returning empty array:', typeof data);
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

    console.log(`🔍 Fetching records for mapUid: ${mapUid}`);
    console.log(`📡 API URL: ${url}`);

    try {
        const response = await apiClient.get(url);
        console.log(`✅ API Response Status: ${response.status}`);
        console.log(`📊 Response data length: ${response.data?.length || 'No data'}`);
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching records from Trackmania API:');
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Status Text: ${error.response?.statusText}`);
        console.error(`   URL: ${url}`);
        console.error(`   MapUid: ${mapUid}`);
        console.error(`   Response Data:`, error.response?.data);
        console.error(`   Error Message: ${error.message}`);
        throw new Error(`Failed to fetch records from API: ${error.response?.status} ${error.response?.statusText}`);
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

    const mapsAndLeaderboards = [];
    console.log(`📊 Processing ${allResults.length} maps for ${username}`);

    for (let i = 0; i < allResults.length; i++) {
        const map = allResults[i];
        console.log(`🔍 Processing map ${i + 1}/${allResults.length}: ${map.Name}`);

        const leaderboard = await getRecordsFromApi(map.MapUid);
        const filtered = period ? filterRecordsByPeriod(leaderboard, period) : leaderboard;

        if (filtered.length > 0) {
            mapsAndLeaderboards.push({
                mapName: map.Name,
                leaderboard: filtered
            });
            console.log(`✅ Found ${filtered.length} records for ${map.Name}`);
        } else {
            console.log(`ℹ️ No records found for ${map.Name}`);
        }

        await sleep(500); // TM DOC specified, do not change
    }

    console.log(`🎯 Processing complete: Found ${mapsAndLeaderboards.length} maps with records out of ${allResults.length} total maps`);

    // Resolve player names for all records
    if (mapsAndLeaderboards.length > 0) {
        console.log('👤 Resolving player names...');
        const allAccountIds = new Set();

        // Collect all account IDs
        mapsAndLeaderboards.forEach(mapResult => {
            if (mapResult.leaderboard && Array.isArray(mapResult.leaderboard)) {
                mapResult.leaderboard.forEach(record => {
                    if (record.accountId) {
                        allAccountIds.add(record.accountId);
                    }
                });
            }
        });

        if (allAccountIds.size > 0) {
            try {
                const playerNames = await translateAccountNames(Array.from(allAccountIds));
                console.log(`✅ Resolved ${Object.keys(playerNames).length} player names`);

                // Add player names to records
                mapsAndLeaderboards.forEach(mapResult => {
                    if (mapResult.leaderboard && Array.isArray(mapResult.leaderboard)) {
                        mapResult.leaderboard.forEach(record => {
                            if (record.accountId && playerNames[record.accountId]) {
                                record.playerName = playerNames[record.accountId];
                            }
                        });
                    }
                });
            } catch (error) {
                console.error('❌ Failed to resolve player names:', error.message);
                // Continue without names rather than failing the entire job
            }
        }
    }

    return mapsAndLeaderboards;
};

// Update job status in DynamoDB
const updateJobStatus = async (jobId, status, result = null, error = null) => {
    const expressionAttributeValues = {
        ':status': status,
        ':updated_at': Date.now()
    };

    let updateExpression = 'SET #status = :status, updated_at = :updated_at';
    const expressionAttributeNames = {
        '#status': 'status'
    };

    if (result) {
        updateExpression += ', #result = :result';
        expressionAttributeNames['#result'] = 'result';
        expressionAttributeValues[':result'] = result;
    }

    if (error) {
        updateExpression += ', error_message = :error';
        expressionAttributeValues[':error'] = error;
    }

    const updateParams = {
        TableName: process.env.MAP_SEARCH_RESULTS_TABLE_NAME,
        Key: marshall({ job_id: jobId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues)
    };

    await dynamoClient.send(new UpdateItemCommand(updateParams));
};

// Check and initialize position data for inaccurate mode users
const checkAndInitializePositions = async (username) => {
    try {
        const { Client } = require('pg');

        // Database connection
        const getDbConnection = () => {
            const connectionString = process.env.NEON_DB_CONNECTION_STRING;
            return new Client({
                connectionString: connectionString,
                ssl: {
                    rejectUnauthorized: false
                }
            });
        };

        const client = getDbConnection();
        await client.connect();

        // Check if user is in inaccurate mode
        const alertQuery = `
            SELECT a.alert_type, a.id as alert_id
            FROM alerts a
            JOIN users u ON a.user_id = u.id
            WHERE u.username = $1
        `;

        const { rows: alertRows } = await client.query(alertQuery, [username]);

        if (alertRows.length === 0 || alertRows[0].alert_type !== 'inaccurate') {
            console.log(`ℹ️ User ${username} is not in inaccurate mode`);
            await client.end();
            return false;
        }

        const alertId = alertRows[0].alert_id;
        console.log(`⚡ User ${username} is in inaccurate mode, checking position initialization`);

        // Get user's map UIDs
        const mapsQuery = `
            SELECT am.mapid
            FROM alert_maps am
            WHERE am.alert_id = $1
        `;

        const { rows: mapRows } = await client.query(mapsQuery, [alertId]);
        const mapUids = mapRows.map(row => row.mapid);

        if (mapUids.length === 0) {
            console.log(`ℹ️ No maps found for ${username}`);
            await client.end();
            return false;
        }

        // Check which maps need position initialization
        const uninitializedMaps = [];
        for (const mapUid of mapUids) {
            const positionQuery = `
                SELECT id FROM map_positions WHERE map_uid = $1
            `;

            const { rows: positionRows } = await client.query(positionQuery, [mapUid]);

            if (positionRows.length === 0) {
                uninitializedMaps.push(mapUid);
            }
        }

        if (uninitializedMaps.length === 0) {
            console.log(`✅ All maps for ${username} already have position data`);
            await client.end();
            return false;
        }

        console.log(`🚀 Initializing positions for ${uninitializedMaps.length} maps`);

        // Import the position checking function
        const { checkMapPositions } = require('./checkMapPositions');

        // Get initial positions for uninitialized maps
        const positionResults = await checkMapPositions(uninitializedMaps);

        // Store initial positions
        for (const result of positionResults) {
            if (result.found) {
                await client.query(
                    'INSERT INTO map_positions (map_uid, position, score, last_checked) VALUES ($1, $2, $3, NOW())',
                    [result.map_uid, result.position, result.score]
                );
                console.log(`📝 Initialized position for map ${result.map_uid}: ${result.position}`);
            }
        }

        await client.end();
        console.log(`✅ Position initialization completed for ${username}`);
        return true;

    } catch (error) {
        console.error(`❌ Error initializing positions for ${username}:`, error);
        return false;
    }
};

exports.handler = async (event) => {
    console.log('🗺️ mapSearchBackground Lambda triggered from SQS!', event);

    // Parse SQS event
    const records = event.Records || [];

    if (records.length === 0) {
        console.error('No SQS records found in event');
        return { statusCode: 400, body: 'No SQS records found' };
    }

    // Process each SQS record (should be one at a time due to batch_size = 1)
    for (const record of records) {
        try {
            const messageBody = JSON.parse(record.body);
            const { jobId, username, period } = messageBody;

            console.log(`🔄 Processing job ${jobId} for user ${username}`);

            if (!jobId || !username) {
                console.error('Missing required parameters: jobId and username');
                continue;
            }

            // Update status to processing
            await updateJobStatus(jobId, 'processing');

            // Check if user is in inaccurate mode and needs position initialization
            const needsPositionInit = await checkAndInitializePositions(username);

            // Fetch maps and leaderboards
            const result = await fetchMapsAndLeaderboards(username, period);

            // Update status to completed with results
            await updateJobStatus(jobId, 'completed', result);

            console.log(`✅ Job ${jobId} completed successfully`);

        } catch (error) {
            console.error('❌ Error processing SQS record:', error);

            // Try to extract jobId from the record for error reporting
            try {
                const messageBody = JSON.parse(record.body);
                const { jobId } = messageBody;

                if (jobId) {
                    await updateJobStatus(jobId, 'failed', null, error.message);
                }
            } catch (parseError) {
                console.error('❌ Could not parse SQS record for error reporting:', parseError);
            }
        }
    }

    return { statusCode: 200, body: 'SQS records processed' };
};
