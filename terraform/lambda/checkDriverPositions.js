// lambda/checkDriverPositions.js - Efficient driver notification checking using position API
const oauthApiClient = require('./shared/oauthApiClient');

const BASE_URL = 'https://webservices.openplanet.dev/live';

// Check driver positions for multiple maps efficiently
const checkDriverPositions = async (driverNotifications) => {
    if (!Array.isArray(driverNotifications) || driverNotifications.length === 0) {
        console.warn('⚠️ No driver notifications provided for position checking.');
        return [];
    }

    console.log(`🔍 Checking positions for ${driverNotifications.length} driver notifications`);

    // Group notifications by map UID for batch processing
    const mapGroups = new Map();

    driverNotifications.forEach(notification => {
        const mapUid = notification.map_uid;
        if (!mapGroups.has(mapUid)) {
            mapGroups.set(mapUid, []);
        }
        mapGroups.get(mapUid).push(notification);
    });

    const results = [];
    const mapUids = Array.from(mapGroups.keys());

    // Process maps in batches of 50 (API limit)
    const batchSize = 50;
    for (let i = 0; i < mapUids.length; i += batchSize) {
        const batch = mapUids.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} maps`);

        try {
            const batchResults = await checkBatchPositions(batch, mapGroups);
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
const checkBatchPositions = async (mapUids, mapGroups) => {
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
            const notifications = mapGroups.get(mapUid);

            if (!mapPositionData || !notifications) {
                console.warn(`⚠️ No position data for map ${mapUid}`);
                continue;
            }

            // Check each notification for this map
            for (const notification of notifications) {
                const result = await checkNotificationPosition(notification, mapPositionData);
                if (result) {
                    results.push(result);
                }
            }
        }

        return results;
    } catch (error) {
        console.error('❌ Error fetching position data:', error.message);
        throw error;
    }
};

// Check if a specific notification's position has changed
const checkNotificationPosition = async (notification, positionData) => {
    const { user_id, map_uid, current_position, current_score } = notification;

    // Find the user's current position in the position data
    const userPosition = positionData.find(pos =>
        pos.accountId === notification.tm_account_id ||
        pos.login === notification.tm_username
    );

    if (!userPosition) {
        console.log(`ℹ️ User ${notification.tm_username} not found in position data for map ${map_uid}`);
        return null;
    }

    // Check if position has changed (improved)
    const positionImproved = userPosition.position < current_position;
    const scoreImproved = userPosition.score < current_score;

    if (positionImproved || scoreImproved) {
        console.log(`🎯 Driver ${notification.tm_username} improved on map ${map_uid}: ${current_position} → ${userPosition.position}`);

        return {
            notification_id: notification.id,
            user_id: user_id,
            map_uid: map_uid,
            tm_username: notification.tm_username,
            tm_account_id: notification.tm_account_id,
            old_position: current_position,
            new_position: userPosition.position,
            old_score: current_score,
            new_score: userPosition.score,
            improved: true,
            needs_leaderboard_fetch: true // Will fetch full leaderboard if needed
        };
    }

    return null; // No improvement
};

// Export for use by schedulerProcessor
exports.checkDriverPositions = checkDriverPositions;

// Lambda handler for direct API calls
exports.handler = async (event, context) => {
    console.log('🚗 Driver Position Check Lambda triggered!', event);

    try {
        let driverNotifications;

        if (event.body) {
            const body = JSON.parse(event.body);
            driverNotifications = body.driverNotifications;
        } else if (event.queryStringParameters?.driverNotifications) {
            driverNotifications = JSON.parse(event.queryStringParameters.driverNotifications);
        } else {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'driverNotifications parameter required' })
            };
        }

        const results = await checkDriverPositions(driverNotifications);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
                message: 'Driver position check completed',
                results: results,
                totalChecked: driverNotifications.length,
                improvementsFound: results.length
            })
        };
    } catch (error) {
        console.error('❌ Error in driver position check:', error);
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
