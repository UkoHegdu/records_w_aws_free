// lambda/checkMapPositions.js - Check map positions for inaccurate mode
const oauthApiClient = require('./shared/oauthApiClient');

const BASE_URL = 'https://webservices.openplanet.dev/live';

// Check map positions for multiple maps efficiently
const checkMapPositions = async (mapUids) => {
    if (!Array.isArray(mapUids) || mapUids.length === 0) {
        console.warn('⚠️ No map UIDs provided for position checking.');
        return [];
    }

    console.log(`🔍 Checking positions for ${mapUids.length} maps`);

    const results = [];
    const batchSize = 50;

    // Process maps in batches of 50 (API limit)
    for (let i = 0; i < mapUids.length; i += batchSize) {
        const batch = mapUids.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} maps`);

        try {
            const batchResults = await checkBatchMapPositions(batch);
            results.push(...batchResults);
        } catch (error) {
            console.error(`❌ Error processing batch:`, error.message);
            // Continue with other batches even if one fails
        }
    }

    console.log(`✅ Position check completed: ${results.length} results`);
    return results;
};

// Check positions for a batch of maps
const checkBatchMapPositions = async (mapUids) => {
    const params = new URLSearchParams();
    mapUids.forEach(mapUid => {
        params.append('mapUid[]', mapUid);
    });

    const url = `${BASE_URL}/leaderboards/position?${params.toString()}`;
    console.log(`🌐 Fetching positions for ${mapUids.length} maps`);

    try {
        const response = await oauthApiClient.get(url);
        const positionData = response.data;

        const results = [];

        // Process each map's position data
        for (const mapUid of mapUids) {
            const mapPositionData = positionData[mapUid];

            if (!mapPositionData || !Array.isArray(mapPositionData)) {
                console.warn(`⚠️ No position data for map ${mapUid}`);
                continue;
            }

            // Find the position for score 9999999 (new player threshold)
            const newPlayerPosition = mapPositionData.find(pos => pos.score === 9999999);

            if (newPlayerPosition) {
                results.push({
                    map_uid: mapUid,
                    position: newPlayerPosition.position,
                    score: newPlayerPosition.score,
                    found: true
                });
            } else {
                // If no position found for 9999999, this means the map has no players yet
                results.push({
                    map_uid: mapUid,
                    position: null,
                    score: null,
                    found: false
                });
            }
        }

        return results;
    } catch (error) {
        console.error('❌ Error fetching position data:', error.message);
        throw error;
    }
};

// Initialize map positions for a user's maps
const initializeMapPositions = async (mapUids) => {
    console.log(`🚀 Initializing positions for ${mapUids.length} maps`);

    const positionResults = await checkMapPositions(mapUids);

    // Return results for database storage
    return positionResults.map(result => ({
        map_uid: result.map_uid,
        position: result.position,
        score: result.score || 9999999,
        last_checked: new Date().toISOString()
    }));
};

// Export for use by other Lambda functions
exports.checkMapPositions = checkMapPositions;
exports.initializeMapPositions = initializeMapPositions;

// Lambda handler for direct API calls
exports.handler = async (event, context) => {
    console.log('🗺️ Map Position Check Lambda triggered!', event);

    try {
        let mapUids;

        if (event.body) {
            const body = JSON.parse(event.body);
            mapUids = body.mapUids;
        } else if (event.queryStringParameters?.mapUids) {
            mapUids = JSON.parse(event.queryStringParameters.mapUids);
        } else {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'mapUids parameter required' })
            };
        }

        const results = await checkMapPositions(mapUids);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Map position check completed',
                results: results,
                totalChecked: mapUids.length,
                positionsFound: results.filter(r => r.found).length
            })
        };
    } catch (error) {
        console.error('❌ Error in map position check:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message
            })
        };
    }
};
