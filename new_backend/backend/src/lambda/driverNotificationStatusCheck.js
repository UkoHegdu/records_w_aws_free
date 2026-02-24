// lambda/driverNotificationStatusCheck.js
const { Client } = require('pg');
const apiClient = require('./shared/apiClient');
const accountNames = require('./accountNames');

// Database connection using Neon
const getDbConnection = () => {
    const connectionString = process.env.NEON_DB_CONNECTION_STRING;
    return new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: true
        }
    });
};

exports.handler = async (event, context) => {
    console.log('🔍 Driver Notification Status Check Lambda triggered!', event);

    try {
        // Process all active driver notifications
        const result = await checkNotificationStatuses();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Status check completed successfully',
                processedNotifications: result.processed,
                statusChanges: result.statusChanges,
                reactivated: result.reactivated,
                deactivated: result.deactivated
            })
        };

    } catch (error) {
        console.error('Driver notification status check error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};

// Check status of all active driver notifications
async function checkNotificationStatuses() {
    const client = getDbConnection();
    let processed = 0;
    let statusChanges = 0;
    let reactivated = 0;
    let deactivated = 0;

    try {
        await client.connect();
        console.log('✅ Connected to Neon database');

        // Get all active notifications
        const result = await client.query(`
            SELECT dn.*, u.username 
            FROM driver_notifications dn 
            JOIN users u ON dn.user_id = u.id 
            WHERE dn.is_active = TRUE 
            ORDER BY dn.last_checked ASC
        `);

        const notifications = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            username: row.username,
            mapUid: row.map_uid,
            mapName: row.map_name,
            currentPosition: row.current_position,
            status: row.status || 'active',
            lastChecked: row.last_checked
        }));

        console.log(`📊 Found ${notifications.length} active notifications to check`);

        for (const notification of notifications) {
            try {
                const statusResult = await checkNotificationStatus(notification);
                processed++;

                if (statusResult.statusChanged) {
                    statusChanges++;

                    // Update notification status in database
                    await updateNotificationStatus(
                        client,
                        notification.id,
                        statusResult.newStatus,
                        statusResult.newPosition
                    );

                    if (statusResult.newStatus === 'active') {
                        reactivated++;
                        console.log(`✅ Notification ${notification.id} reactivated - user ${notification.username} is back in top 5`);
                    } else {
                        deactivated++;
                        console.log(`⚠️ Notification ${notification.id} deactivated - user ${notification.username} is no longer in top 5`);
                    }
                } else {
                    console.log(`✅ Notification ${notification.id} status unchanged - user ${notification.username} still ${notification.status}`);
                }

            } catch (error) {
                console.error(`Error checking notification ${notification.id}:`, error);
                // Continue with other notifications even if one fails
            }
        }

        console.log(`✅ Status check completed: ${processed} processed, ${statusChanges} changes (${reactivated} reactivated, ${deactivated} deactivated)`);

        return {
            processed,
            statusChanges,
            reactivated,
            deactivated
        };

    } catch (error) {
        console.error('Error in status check:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Check status of a single notification
async function checkNotificationStatus(notification) {
    try {
        console.log(`🔍 Checking status for notification ${notification.id} (user: ${notification.username}, map: ${notification.mapUid})`);

        // Get current leaderboard for the map
        const leaderboardData = await getMapLeaderboard(notification.mapUid);

        if (!leaderboardData || !Array.isArray(leaderboardData)) {
            console.warn(`No leaderboard data for map ${notification.mapUid}`);
            return { statusChanged: false, reason: 'No leaderboard data' };
        }

        // Find user's current position in leaderboard
        const currentPosition = await findUserPosition(leaderboardData, notification.username);

        if (!currentPosition) {
            console.warn(`User ${notification.username} not found in leaderboard for map ${notification.mapUid}`);
            return { statusChanged: false, reason: 'User not in leaderboard' };
        }

        // Determine new status based on position
        const newStatus = currentPosition <= 5 ? 'active' : 'inactive';
        const statusChanged = notification.status !== newStatus;

        console.log(`📊 User ${notification.username} position: ${currentPosition}, status: ${notification.status} → ${newStatus}`);

        return {
            statusChanged,
            newStatus,
            newPosition: currentPosition,
            oldStatus: notification.status
        };

    } catch (error) {
        console.error(`Error checking notification status for ${notification.id}:`, error);
        return { statusChanged: false, reason: 'Error checking status' };
    }
}

// Get leaderboard data for a map
async function getMapLeaderboard(mapUid) {
    try {
        const baseUrl = process.env.LEAD_API;
        const url = `${baseUrl}/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;

        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching leaderboard for map ${mapUid}:`, error);
        return null;
    }
}

// Find user's position in leaderboard
async function findUserPosition(leaderboardData, username) {
    try {
        for (const group of leaderboardData) {
            if (group.tops && Array.isArray(group.tops)) {
                for (let i = 0; i < group.tops.length; i++) {
                    const record = group.tops[i];
                    if (record.accountId) {
                        // Get display name for this account
                        try {
                            const accountNamesResult = await accountNames.translateAccountNames([record.accountId]);
                            const displayName = accountNamesResult[record.accountId];

                            if (displayName && displayName.toLowerCase() === username.toLowerCase()) {
                                return i + 1; // Position is 1-based
                            }
                        } catch (error) {
                            console.warn(`Failed to get display name for account ${record.accountId}:`, error.message);
                        }
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Error finding user position:', error);
        return null;
    }
}

// Update notification status in database
async function updateNotificationStatus(client, notificationId, newStatus, newPosition) {
    try {
        await client.query(`
            UPDATE driver_notifications 
            SET status = $1, current_position = $2, last_checked = NOW() 
            WHERE id = $3
        `, [newStatus, newPosition, notificationId]);

        console.log(`✅ Updated notification ${notificationId}: status=${newStatus}, position=${newPosition}`);
    } catch (error) {
        console.error(`Error updating notification ${notificationId}:`, error);
        throw error;
    }
}
