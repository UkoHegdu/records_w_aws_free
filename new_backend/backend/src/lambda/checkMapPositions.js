// lambda/checkMapPositions.js - Check map positions for inaccurate mode
// Uses Nadeo position API: POST .../leaderboard/group/map?scores[mapUid]=score
const apiClient = require('./shared/apiClient');

const NEW_PLAYER_SCORE_MS = 9999999; // sentinel score to get "position if a new player joined"

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
// Nadeo API: POST /api/token/leaderboard/group/map?scores[mapUid]=score
// Body: { maps: [{ mapUid, groupUid: "Personal_Best" }] }
// Response: array of { mapUid, score, zones: [{ ranking: { position } }] }
const checkBatchMapPositions = async (mapUids) => {
    const baseUrl = process.env.LEAD_API;
    const params = new URLSearchParams();
    mapUids.forEach(mapUid => {
        params.append(`scores[${mapUid}]`, NEW_PLAYER_SCORE_MS);
    });
    const url = `${baseUrl}/api/token/leaderboard/group/map?${params.toString()}`;
    const body = {
        maps: mapUids.map(mapUid => ({ mapUid, groupUid: 'Personal_Best' }))
    };

    try {
        const response = await apiClient.post(url, body);
        const positionArray = Array.isArray(response.data) ? response.data : [];

        // Build map: mapUid -> { position, score }
        const byMapUid = new Map();
        for (const item of positionArray) {
            const position = item.zones?.[0]?.ranking?.position;
            if (typeof position === 'number') {
                byMapUid.set(item.mapUid, { position, score: item.score });
            }
        }

        const results = [];
        for (const mapUid of mapUids) {
            const data = byMapUid.get(mapUid);
            if (data) {
                results.push({
                    map_uid: mapUid,
                    position: data.position,
                    score: data.score,
                    found: true
                });
            } else {
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
        score: result.score ?? NEW_PLAYER_SCORE_MS,
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
