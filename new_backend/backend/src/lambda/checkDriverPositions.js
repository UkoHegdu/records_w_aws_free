// lambda/checkDriverPositions.js - Driver notification checking using leaderboard top API
// Uses LEAD_API (same as mapSearch and driverNotificationProcessor) for consistency and reliability
const apiClient = require('./shared/apiClient');

// Fetch leaderboard top for a map (returns array of { accountId, login, position, score } for position comparison).
const getLeaderboardTopForMap = async (mapUid) => {
    const baseUrl = process.env.LEAD_API;
    if (!baseUrl) {
        console.warn('⚠️ LEAD_API not configured, cannot fetch leaderboard');
        return null;
    }
    const url = `${baseUrl}/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;
    try {
        const response = await apiClient.get(url);
        const tops = response.data?.tops;
        if (!tops?.[0]?.top || !Array.isArray(tops[0].top)) {
            return null;
        }
        return tops[0].top.map((entry) => ({
            accountId: entry.accountId,
            login: entry.login,
            position: entry.position,
            score: entry.score >= 0 ? entry.score : null
        }));
    } catch (err) {
        const status = err.response?.status;
        const statusText = err.response?.statusText;
        console.warn(`⚠️ Leaderboard fetch failed for map ${mapUid}:`, err.message, status ? `(${status} ${statusText})` : '');
        return null;
    }
};

// Check driver positions for multiple maps (one leaderboard request per map).
const checkDriverPositions = async (driverNotifications) => {
    if (!Array.isArray(driverNotifications) || driverNotifications.length === 0) {
        console.warn('⚠️ No driver notifications provided for position checking.');
        return [];
    }

    console.log(`🔍 Checking positions for ${driverNotifications.length} driver notifications`);

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

    for (const mapUid of mapUids) {
        const notifications = mapGroups.get(mapUid);
        if (!notifications || notifications.length === 0) continue;

        const positionData = await getLeaderboardTopForMap(mapUid);
        if (!positionData || positionData.length === 0) {
            console.warn(`⚠️ No leaderboard data for map ${mapUid}`);
            continue;
        }

        for (const notification of notifications) {
            const result = await checkNotificationPosition(notification, positionData);
            if (result) {
                results.push(result);
            }
        }
    }

    console.log(`✅ Position check completed: ${results.length} results`);
    return results;
};

// Compare stored position (DB) vs current live position (API). No time window – we detect
// any worsening (e.g. 2→3) whenever the scheduler runs, regardless of when it last ran.
const checkNotificationPosition = async (notification, positionData) => {
    const { user_id, map_uid, current_position, current_score } = notification;
    const storedScore = current_score ?? notification.personal_best ?? 0;

    if (!notification.tm_account_id && !notification.tm_username) {
        console.warn(`⚠️ Cannot check position for notification ${notification.id}: user has no tm_account_id or tm_username`);
        return null;
    }

    const userPosition = positionData.find(pos =>
        pos.accountId === notification.tm_account_id ||
        pos.login === notification.tm_username
    );

    if (!userPosition) {
        console.log(`ℹ️ User ${notification.tm_username} not found in position data for map ${map_uid}`);
        return null;
    }

    const positionImproved = userPosition.position < current_position;
    const scoreImproved = userPosition.score < storedScore;
    const positionWorsened = userPosition.position > current_position;

    if (positionImproved || scoreImproved) {
        console.log(`🎯 Driver ${notification.tm_username} improved on map ${map_uid}: ${current_position} → ${userPosition.position}`);

        return {
            notification_id: notification.id,
            user_id: user_id,
            map_uid: map_uid,
            map_name: notification.map_name,
            tm_username: notification.tm_username,
            tm_account_id: notification.tm_account_id,
            old_position: current_position,
            new_position: userPosition.position,
            old_score: storedScore,
            new_score: userPosition.score,
            improved: true,
            worsened: false,
            needs_leaderboard_fetch: true
        };
    }

    if (positionWorsened) {
        console.log(`📧 Driver ${notification.tm_username} position beaten on map ${map_uid}: ${current_position} → ${userPosition.position}`);

        return {
            notification_id: notification.id,
            user_id: user_id,
            map_uid: map_uid,
            map_name: notification.map_name,
            tm_username: notification.tm_username,
            tm_account_id: notification.tm_account_id,
            old_position: current_position,
            new_position: userPosition.position,
            old_score: storedScore,
            new_score: userPosition.score,
            improved: false,
            worsened: true,
            needs_leaderboard_fetch: false
        };
    }

    return null; // No change
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
