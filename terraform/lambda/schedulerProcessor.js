// lambda/schedulerProcessor.js - Processes queued user checks in two phases with caching
const { fetchMapsAndLeaderboards, fetchMapListOnly, getRecordsFromApi, filterRecordsByPeriod } = require('./mapSearch');

const AUTO_INACCURATE_MAP_THRESHOLD = 100;
const INACCURATE_OVERFLOW_THRESHOLD = 100;
const INACCURATE_OVERFLOW_MESSAGE = "You got new times in more than 100 maps, ain't nobody got time to go through leaderboards for 100 maps, sorry buddy";
const { translateAccountNames } = require('./accountNames');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Configure DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Cache functions for map leaderboard data
const cacheMapLeaderboard = async (mapId, leaderboardData) => {
    const cacheKey = `map_${mapId}_${new Date().toISOString().split('T')[0]}`;
    const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

    const item = {
        cache_key: cacheKey,
        map_id: mapId,
        leaderboard_data: leaderboardData,
        cached_at: Date.now(),
        ttl: ttl
    };

    const params = {
        TableName: process.env.MAP_LEADERBOARD_CACHE_TABLE_NAME,
        Item: marshall(item)
    };

    try {
        await dynamoClient.send(new PutItemCommand(params));
        console.log(`✅ Cached leaderboard data for map ${mapId}`);
        return true;
    } catch (error) {
        console.error(`❌ Error caching leaderboard data for map ${mapId}:`, error.message);
        return false;
    }
};

const getCachedMapLeaderboard = async (mapId) => {
    const cacheKey = `map_${mapId}_${new Date().toISOString().split('T')[0]}`;

    const params = {
        TableName: process.env.MAP_LEADERBOARD_CACHE_TABLE_NAME,
        Key: marshall({ cache_key: cacheKey })
    };

    try {
        const result = await dynamoClient.send(new GetItemCommand(params));
        if (result.Item) {
            const item = unmarshall(result.Item);
            console.log(`✅ Retrieved cached leaderboard data for map ${mapId}`);
            return item.leaderboard_data;
        }
        console.log(`ℹ️ No cached data found for map ${mapId}`);
        return null;
    } catch (error) {
        console.error(`❌ Error retrieving cached data for map ${mapId}:`, error.message);
        return null;
    }
};

// Enhanced retry configuration for scheduler
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000, // 1 second
    maxDelayMs: 10000,  // 10 seconds
    timeoutMs: 30000    // 30 seconds
};

// Sleep utility for retries
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Timeout wrapper for operations
const withTimeout = async (operation, timeoutMs = RETRY_CONFIG.timeoutMs) => {
    return Promise.race([
        operation(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
};

// Enhanced retry wrapper with exponential backoff and timeout
const withRetry = async (operation, operationName, retries = RETRY_CONFIG.maxRetries) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🔄 ${operationName} - Attempt ${attempt}/${retries}`);
            const result = await withTimeout(operation, RETRY_CONFIG.timeoutMs);
            console.log(`✅ ${operationName} - Success on attempt ${attempt}`);
            return result;
        } catch (error) {
            const isLastAttempt = attempt === retries;
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                code: error.code,
                isTimeout: error.message.includes('timed out')
            };

            console.error(`❌ ${operationName} - Attempt ${attempt} failed:`, errorDetails);

            if (isLastAttempt) {
                console.error(`💥 ${operationName} - All ${retries} attempts failed`);
                throw new Error(`${operationName} failed after ${retries} attempts. Last error: ${error.message}`);
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                RETRY_CONFIG.maxDelayMs
            );

            console.log(`⏳ ${operationName} - Waiting ${delay}ms before retry ${attempt + 1}...`);
            await sleep(delay);
        }
    }
};

// Format new records for email with retry logic and popularity limits
async function formatNewRecords(records) {
    // Configuration for map popularity limits
    const MAX_RECORDS_PER_MAP = parseInt(process.env.MAX_NEW_RECORDS_PER_MAP || '20');
    const POPULAR_MAP_MESSAGE = process.env.POPULAR_MAP_MESSAGE || 'This map has had more than 20 new times and we are not showing all the details to prevent email spam.';

    // Step 1: Collect unique accountIds (only from maps that won't be truncated)
    const accountIds = Array.from(new Set(
        records.flatMap(record => {
            // Only collect account IDs from maps that won't be truncated
            if (record.leaderboard.length <= MAX_RECORDS_PER_MAP) {
                return record.leaderboard.map(entry => entry.accountId);
            }
            return [];
        })
    ));

    console.log(`📊 Formatting ${records.length} records with ${accountIds.length} unique account IDs (after popularity filtering)`);

    // Step 2: Use accountNames helper with retry logic (only for non-truncated maps)
    const accountIdToName = await withRetry(
        () => translateAccountNames(accountIds),
        `Account name translation for ${accountIds.length} IDs`
    );

    // Step 3: Format the records nicely with popularity limits
    let formatted = '';

    for (const record of records) {
        formatted += `🗺️ Map: ${record.mapName}\n`;

        // Check if this map has too many new records
        if (record.leaderboard.length > MAX_RECORDS_PER_MAP) {
            formatted += `  ⚠️ ${POPULAR_MAP_MESSAGE}\n\n`;
        } else {
            // Normal processing for maps with reasonable number of records
            for (const entry of record.leaderboard) {
                const playerName = accountIdToName[entry.accountId] || entry.accountId;
                const date = new Date(entry.timestamp * 1000).toLocaleString();

                formatted += `  🏎️ Player: ${playerName}\n`;
                formatted += `  📍 Zone: ${entry.zoneName}\n`;
                formatted += `  🥇 Position: ${entry.position}\n`;
                formatted += `  📅 Date: ${date}\n\n`;
            }
        }
    }

    return formatted.trim();
}

// Save email body to DynamoDB for later sending with retry logic
async function saveEmailBodyToDynamoDB(userId, username, email, mapperContent) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days from now

    const item = {
        user_id: userId,
        date: today,
        username: username,
        email: email,
        mapper_content: mapperContent || '',
        driver_content: '', // Will be filled by driver notification processor
        ttl: ttl
    };

    const params = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Item: marshall(item)
    };

    await withRetry(
        () => dynamoClient.send(new PutItemCommand(params)),
        `DynamoDB save for user ${username}`
    );

    console.log(`✅ Email body saved to DynamoDB for user ${username}`);
    return true;
}

const applyRecordFilterToMaps = (records, recordFilter) => {
    const filter = (entry) => {
        const pos = Number(entry?.position);
        if (!Number.isFinite(pos)) return false;
        if (recordFilter === 'top5') return pos <= 5;
        if (recordFilter === 'wr') return pos === 1;
        return true; // 'all'
    };

    if (!Array.isArray(records) || recordFilter === 'all') return records || [];

    return records
        .map(r => ({
            ...r,
            leaderboard: Array.isArray(r.leaderboard) ? r.leaderboard.filter(filter) : []
        }))
        .filter(r => Array.isArray(r.leaderboard) && r.leaderboard.length > 0);
};

// Process map alert check (Phase 1) with caching and alert type support
const processMapAlertCheck = async (username, email) => {
    console.log(`🔍 Phase 1: Checking map alerts for ${username}...`);

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

        // Get user's alert type, id, and record_filter
        let alertQuery = `
            SELECT a.id, a.alert_type, a.map_count, a.record_filter
            FROM alerts a
            JOIN users u ON a.user_id = u.id
            WHERE u.username = $1
        `;
        let alertRows;
        try {
            ({ rows: alertRows } = await client.query(alertQuery, [username]));
        } catch (err) {
            if (String(err?.message || '').includes('record_filter')) {
                alertQuery = `
                    SELECT a.id, a.alert_type, a.map_count
                    FROM alerts a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.username = $1
                `;
                ({ rows: alertRows } = await client.query(alertQuery, [username]));
            } else {
                throw err;
            }
        }

        if (alertRows.length === 0) {
            console.log(`ℹ️ No alerts found for ${username}`);
            await client.end();
            return { success: true, recordsFound: 0, phase: 1 };
        }

        const { id: alertId, alert_type, map_count, record_filter } = alertRows[0];
        const recordFilter = record_filter || 'top5';
        console.log(`📊 User ${username} has ${map_count} maps with ${alert_type} mode`);

        let finalAlertType = alert_type;
        let newRecords = [];
        let mapperContent = '';
        let inaccurateOverflowCount = 0;

        // Auto-switch to inaccurate when user has > 100 maps (accurate mode only)
        if (finalAlertType === 'accurate') {
            const mapList = await fetchMapListOnly(username);
            const mapCount = mapList.length;

            // Always persist map count for admin panel
            if (alertId) {
                await client.query(
                    'UPDATE alerts SET map_count = $1 WHERE id = $2',
                    [mapCount, alertId]
                );
            }

            if (mapCount > AUTO_INACCURATE_MAP_THRESHOLD) {
                console.log(`🔄 Auto-switching ${username} to inaccurate mode (${mapCount} maps > ${AUTO_INACCURATE_MAP_THRESHOLD})`);

                if (alertId && mapList.length > 0) {
                    await client.query(
                        'UPDATE alerts SET alert_type = $1, map_count = $2 WHERE id = $3',
                        ['inaccurate', mapCount, alertId]
                    );

                    for (const map of mapList) {
                        await client.query(
                            'INSERT INTO alert_maps (alert_id, mapid) VALUES ($1, $2) ON CONFLICT (alert_id, mapid) DO NOTHING',
                            [alertId, map.MapUid]
                        );
                    }
                    console.log(`✅ Populated alert_maps with ${mapList.length} maps for ${username}`);

                    const { checkMapPositions } = require('./checkMapPositions');
                    const positionResults = await checkMapPositions(mapList.map(m => m.MapUid));
                    for (const r of positionResults) {
                        if (r.found) {
                            await client.query(
                                'INSERT INTO map_positions (map_uid, position, score, last_checked) VALUES ($1, $2, $3, NOW()) ON CONFLICT (map_uid) DO NOTHING',
                                [r.map_uid, r.position, r.score]
                            );
                        }
                    }
                    console.log(`✅ Initialized map_positions baseline for ${username}`);

                    finalAlertType = 'inaccurate';
                }
            }
        }

        if (finalAlertType === 'accurate') {
            // Traditional accurate mode - fetch full leaderboards
            console.log(`🎯 Processing ${username} in accurate mode`);
            newRecords = await fetchMapsAndLeaderboards(username, '1d');
            newRecords = applyRecordFilterToMaps(newRecords, recordFilter);

            // Cache leaderboard data for each map
            for (const record of newRecords) {
                await cacheMapLeaderboard(record.mapId, record.leaderboard);
            }

            if (newRecords.length > 0) {
                console.log(`📊 Found ${newRecords.length} new records for ${username}`);
                mapperContent = await formatNewRecords(newRecords);
            } else {
                console.log(`ℹ️ No new records for ${username}`);
            }

        } else if (finalAlertType === 'inaccurate') {
            // Inaccurate mode - use position API
            console.log(`⚡ Processing ${username} in inaccurate mode`);
            const inaccurateResult = await processInaccurateMode(username, client, alertId);
            newRecords = applyRecordFilterToMaps(inaccurateResult.records, recordFilter);
            inaccurateOverflowCount = inaccurateResult.overflowMapCount || 0;

            if (inaccurateOverflowCount > 0) {
                if (recordFilter === 'all') {
                    mapperContent = `${INACCURATE_OVERFLOW_MESSAGE} (${inaccurateOverflowCount} maps)`;
                } else {
                    console.log(`ℹ️ Overflow hit for ${username}; skipping mapper email due to record_filter=${recordFilter}`);
                    mapperContent = '';
                }
            } else if (newRecords.length > 0) {
                console.log(`📊 Found ${newRecords.length} new records for ${username}`);
                mapperContent = await formatNewRecords(newRecords);
            } else {
                console.log(`ℹ️ No new records for ${username}`);
            }
        }

        await client.end();

        // Save email body to DynamoDB (will be sent later by email sender)
        await saveEmailBodyToDynamoDB(username, username, email, mapperContent);

        const hasMapperNotification = mapperContent && mapperContent.trim().length > 0;
        const recordsForLog = hasMapperNotification
            ? (newRecords.length > 0 ? newRecords.length : inaccurateOverflowCount)
            : 0;
        await logNotificationHistory(username, 'mapper_alert',
            hasMapperNotification ? 'sent' : 'no_new_times',
            hasMapperNotification ? `Notification sent for ${recordsForLog} map(s)!` : 'No new notifications were sent',
            recordsForLog);

        return { success: true, recordsFound: recordsForLog, phase: 1, alert_type: finalAlertType };
    } catch (error) {
        console.error(`❌ Error processing map alerts for ${username}:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Log technical error
        await logTechnicalError(username, 'mapper_alert', error.message);
        throw error;
    }
};

// Fetch leaderboard for a map and filter by period (1d) - same as accurate mode
const fetchLeaderboardForMap = async (mapUid) => {
    try {
        const leaderboard = await getRecordsFromApi(mapUid);
        const filtered = filterRecordsByPeriod(leaderboard, '1d');

        return filtered.map(record => {
            const ts = record.timestamp;
            const timestampMs = ts != null ? (ts < 1e12 ? ts * 1000 : ts) : Date.now();
            return {
                accountId: record.accountId,
                zoneName: record.zoneName || 'World',
                position: record.position,
                timestamp: Math.floor(timestampMs / 1000) // formatNewRecords expects seconds
            };
        });
    } catch (error) {
        console.error(`❌ Error fetching leaderboard for map ${mapUid}:`, error.message);
        return [];
    }
};

// Process inaccurate mode using position API
const processInaccurateMode = async (username, client, alertId) => {
    console.log(`⚡ Processing inaccurate mode for ${username}`);

    try {
        const { fetchMapListOnly } = require('./mapSearch');

        // Sync alert_maps with current map list (new maps since last run)
        const mapList = await fetchMapListOnly(username);
        const currentMapUids = new Set(mapList.map(m => m.MapUid));
        const mapUidToName = new Map(mapList.map(m => [m.MapUid, m.Name]));

        const { rows: existingRows } = await client.query(
            'SELECT mapid FROM alert_maps am JOIN alerts a ON am.alert_id = a.id JOIN users u ON a.user_id = u.id WHERE u.username = $1',
            [username]
        );
        const existingMapUids = new Set(existingRows.map(r => r.mapid));

        const newMapUids = [...currentMapUids].filter(uid => !existingMapUids.has(uid));
        if (newMapUids.length > 0 && alertId) {
            for (const mapUid of newMapUids) {
                await client.query(
                    'INSERT INTO alert_maps (alert_id, mapid) VALUES ($1, $2) ON CONFLICT (alert_id, mapid) DO NOTHING',
                    [alertId, mapUid]
                );
            }
            console.log(`✅ Synced ${newMapUids.length} new maps to alert_maps for ${username}`);
        }

        const mapsQuery = `
            SELECT am.mapid
            FROM alert_maps am
            JOIN alerts a ON am.alert_id = a.id
            JOIN users u ON a.user_id = u.id
            WHERE u.username = $1
        `;

        const { rows: mapRows } = await client.query(mapsQuery, [username]);
        const mapUids = mapRows.map(row => row.mapid);

        if (mapUids.length === 0) {
            console.log(`ℹ️ No maps found for ${username}`);
            return { records: [], overflowMapCount: 0 };
        }

        if (alertId) {
            await client.query(
                'UPDATE alerts SET map_count = $1 WHERE id = $2',
                [mapUids.length, alertId]
            );
        }

        console.log(`🗺️ Checking positions for ${mapUids.length} maps`);

        const { checkMapPositions } = require('./checkMapPositions');
        const positionResults = await withRetry(
            () => checkMapPositions(mapUids),
            `Position check for ${mapUids.length} maps`
        );

        const positionChanges = [];
        const uninitializedMaps = [];

        for (const result of positionResults) {
            if (!result.found) continue;

            const { rows: positionRows } = await client.query(
                'SELECT position, score FROM map_positions WHERE map_uid = $1',
                [result.map_uid]
            );

            if (positionRows.length === 0) {
                const mapName = mapUidToName.get(result.map_uid) || result.map_uid;
                uninitializedMaps.push({ mapId: result.map_uid, mapName });
                await client.query(
                    'INSERT INTO map_positions (map_uid, position, score, last_checked) VALUES ($1, $2, $3, NOW())',
                    [result.map_uid, result.position, result.score]
                );
                continue;
            }

            const storedPosition = positionRows[0];
            if (result.position !== storedPosition.position) {
                console.log(`🎯 Position changed for map ${result.map_uid}: ${storedPosition.position} → ${result.position}`);

                await client.query(
                    'UPDATE map_positions SET position = $1, score = $2, last_checked = NOW() WHERE map_uid = $3',
                    [result.position, result.score, result.map_uid]
                );

                const mapName = mapUidToName.get(result.map_uid) || result.map_uid;
                positionChanges.push({
                    mapId: result.map_uid,
                    mapName
                });
            }
        }

        if (uninitializedMaps.length > 0) {
            console.log(`📝 Position initialization complete for ${uninitializedMaps.length} maps`);
        }

        const mapsToFetch = positionChanges.length + uninitializedMaps.length;
        if (mapsToFetch === 0) {
            console.log(`📊 Found 0 maps with new players`);
            return { records: [], overflowMapCount: 0 };
        }

        if (mapsToFetch > INACCURATE_OVERFLOW_THRESHOLD) {
            console.log(`📊 Found ${mapsToFetch} maps with new players (overflow, using summary)`);
            return { records: [], overflowMapCount: mapsToFetch };
        }

        const changedMaps = [];
        const sleepMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (const change of positionChanges) {
            const leaderboardData = await fetchLeaderboardForMap(change.mapId);
            if (leaderboardData.length > 0) {
                changedMaps.push({
                    mapId: change.mapId,
                    mapName: change.mapName,
                    leaderboard: leaderboardData
                });
            }
            await sleepMs(500);
        }

        for (const map of uninitializedMaps) {
            const leaderboardData = await fetchLeaderboardForMap(map.mapId);
            if (leaderboardData.length > 0) {
                changedMaps.push({
                    mapId: map.mapId,
                    mapName: map.mapName,
                    leaderboard: leaderboardData
                });
            }
            await sleepMs(500);
        }

        console.log(`📊 Found ${changedMaps.length} maps with new players`);
        return { records: changedMaps, overflowMapCount: 0 };
    } catch (error) {
        console.error(`❌ Error processing inaccurate mode for ${username}:`, error);
        throw error;
    }
};

// Process driver notification check (Phase 2) using position API
const processDriverNotificationCheck = async (username, email) => {
    console.log(`🔍 Phase 2: Checking driver notifications for ${username}...`);

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

        // Get user's driver notifications
        const driverNotificationsQuery = `
            SELECT dn.*, u.tm_account_id, u.tm_username 
            FROM driver_notifications dn
            JOIN users u ON dn.user_id = u.id
            WHERE u.username = $1
        `;

        const { rows: driverNotifications } = await client.query(driverNotificationsQuery, [username]);

        if (driverNotifications.length === 0) {
            console.log(`ℹ️ No driver notifications found for ${username}`);
            await client.end();
            return { success: true, notificationsProcessed: 0, phase: 2 };
        }

        console.log(`📊 Found ${driverNotifications.length} driver notifications for ${username}`);

        // Import the position checking function
        const { checkDriverPositions } = require('./checkDriverPositions');

        // Check positions efficiently using position API
        const positionResults = await withRetry(
            () => checkDriverPositions(driverNotifications),
            `Position check for ${driverNotifications.length} notifications`
        );

        let driverContent = '';
        let notificationsProcessed = 0;
        const improvedResults = positionResults.filter(r => r.improved);
        const worsenedResults = positionResults.filter(r => r.worsened);

        if (improvedResults.length > 0) {
            console.log(`🎯 Found ${improvedResults.length} improved positions for ${username}`);
            for (const result of improvedResults) {
                if (result.needs_leaderboard_fetch) {
                    const cachedData = await getCachedMapLeaderboard(result.map_uid);
                    if (cachedData) {
                        console.log(`✅ Using cached leaderboard data for map ${result.map_uid}`);
                        driverContent += formatDriverNotification(result, cachedData);
                    } else {
                        driverContent += `🏎️ ${result.tm_username} improved position on map ${result.map_uid}: ${result.old_position} → ${result.new_position}\n`;
                    }
                    await client.query(
                        'UPDATE driver_notifications SET current_position = $1, last_checked = NOW(), updated_at = NOW() WHERE id = $2',
                        [result.new_position, result.notification_id]
                    );
                    notificationsProcessed++;
                }
            }
        }

        if (worsenedResults.length > 0) {
            console.log(`📧 Found ${worsenedResults.length} positions beaten for ${username}`);
            for (const result of worsenedResults) {
                driverContent += formatDriverNotificationWorsened(result);
                const shouldBeInactive = result.new_position > 5;
                const newStatus = shouldBeInactive ? 'inactive' : 'active';
                await client.query(
                    'UPDATE driver_notifications SET current_position = $1, status = $2, last_checked = NOW(), updated_at = NOW() WHERE id = $3',
                    [result.new_position, newStatus, result.notification_id]
                );
                notificationsProcessed++;
            }
        }

        if (positionResults.length === 0) {
            console.log(`ℹ️ No position changes found for ${username}`);
        }

        // Update last_checked for all notifications that were checked (so last verification date advances)
        const notificationIds = driverNotifications.map(n => n.id);
        if (notificationIds.length > 0) {
            await client.query(
                'UPDATE driver_notifications SET last_checked = NOW() WHERE id = ANY($1::int[])',
                [notificationIds]
            );
        }

        // Update email content in DynamoDB with driver notifications
        if (driverContent) {
            await updateEmailContentWithDriverNotifications(username, email, driverContent);
        }

        // Log notification history
        await logNotificationHistory(username, 'driver_notification',
            notificationsProcessed > 0 ? 'sent' : 'no_new_times',
            notificationsProcessed > 0 ? `Notification: ${notificationsProcessed} driver update(s) (position improved or beaten).` : 'No new driver notifications were sent',
            notificationsProcessed);

        await client.end();

        return {
            success: true,
            notificationsProcessed: notificationsProcessed,
            improvementsFound: positionResults.length,
            phase: 2
        };
    } catch (error) {
        console.error(`❌ Error processing driver notifications for ${username}:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Log technical error
        await logTechnicalError(username, 'driver_notification', error.message);
        throw error;
    }
};

// Format "someone beat you" (position worsened) notification content
const formatDriverNotificationWorsened = (result) => {
    const mapName = result.map_name || result.map_uid;
    return `🏎️ Map: ${mapName}\n` +
        `📍 Someone beat your score – position changed: #${result.old_position} → #${result.new_position}\n` +
        `📅 Detected: ${new Date().toLocaleString()}\n\n`;
};

// Format driver notification content (position improved)
const formatDriverNotification = (result, leaderboardData) => {
    const { tm_username, map_uid, old_position, new_position, old_score, new_score } = result;

    let content = `🏎️ Driver Notification: ${tm_username}\n`;
    content += `🗺️ Map: ${map_uid}\n`;
    content += `📈 Position improved: ${old_position} → ${new_position}\n`;
    content += `⏱️ Score improved: ${old_score} → ${new_score}\n`;

    // Add leaderboard context if available
    if (leaderboardData && leaderboardData.length > 0) {
        content += `🏆 Current leaderboard:\n`;
        leaderboardData.slice(0, 5).forEach((entry, index) => {
            content += `  ${index + 1}. ${entry.playerName || entry.accountId} - ${entry.score}\n`;
        });
    }

    content += `\n`;
    return content;
};

// Update email content with driver notifications (creates row if missing for driver-only users)
const updateEmailContentWithDriverNotifications = async (username, email, driverContent) => {
    const today = new Date().toISOString().split('T')[0];
    const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

    const getParams = {
        TableName: process.env.DAILY_EMAILS_TABLE_NAME,
        Key: marshall({
            user_id: username,
            date: today
        })
    };

    try {
        const { GetItemCommand } = require('@aws-sdk/client-dynamodb');
        const existingItem = await dynamoClient.send(new GetItemCommand(getParams));

        if (existingItem.Item) {
            const item = unmarshall(existingItem.Item);
            await dynamoClient.send(new PutItemCommand({
                TableName: process.env.DAILY_EMAILS_TABLE_NAME,
                Item: marshall({
                    ...item,
                    driver_content: driverContent,
                    updated_at: Date.now()
                })
            }));
            console.log(`✅ Updated email content with driver notifications for ${username}`);
        } else {
            // Driver-only user: no Phase 1 row; create so emailSender can send
            await dynamoClient.send(new PutItemCommand({
                TableName: process.env.DAILY_EMAILS_TABLE_NAME,
                Item: marshall({
                    user_id: username,
                    date: today,
                    username: username,
                    email: email,
                    mapper_content: '',
                    driver_content: driverContent,
                    ttl: ttl,
                    updated_at: Date.now()
                })
            }));
            console.log(`✅ Created daily email row with driver notifications for ${username}`);
        }
    } catch (error) {
        console.error(`❌ Error updating email content for ${username}:`, error.message);
    }
};

exports.handler = async (event) => {
    const startTime = Date.now();
    console.log('📧 Scheduler Processor Lambda triggered from SQS!', {
        event: event,
        timestamp: new Date().toISOString(),
        requestId: event.requestContext?.requestId || 'unknown'
    });

    // Parse SQS event
    const records = event.Records || [];

    if (records.length === 0) {
        console.error('❌ No SQS records found in event');
        return { statusCode: 400, body: 'No SQS records found' };
    }

    let totalProcessed = 0;
    let totalRecordsFound = 0;
    let totalErrors = 0;
    const errors = [];

    // Process each SQS record (should be one at a time due to batch_size = 1)
    for (const record of records) {
        const recordStartTime = Date.now();
        try {
            const messageBody = JSON.parse(record.body);
            const { username, email, type, phase, timestamp } = messageBody;

            console.log(`🔄 Processing ${type} (Phase ${phase}) for user ${username}`, {
                messageId: record.messageId,
                receiptHandle: record.receiptHandle?.substring(0, 20) + '...',
                originalTimestamp: timestamp ? new Date(timestamp).toISOString() : 'unknown'
            });

            if (!username || !email || !type) {
                const error = 'Missing required parameters: username, email, and type';
                console.error(`❌ ${error}`, { messageBody });
                errors.push({ username: username || 'unknown', error });
                totalErrors++;
                continue;
            }

            let result;
            if (type === 'map_alert_check') {
                result = await processMapAlertCheck(username, email);
                totalRecordsFound += result.recordsFound || 0;
            } else if (type === 'driver_notification_check') {
                result = await processDriverNotificationCheck(username, email);
                // TODO: Add notification counting when implemented
            } else {
                throw new Error(`Unknown job type: ${type}`);
            }

            totalProcessed++;
            const processingTime = Date.now() - recordStartTime;
            console.log(`✅ Completed ${type} for ${username}`, {
                phase: result.phase,
                recordsFound: result.recordsFound || 0,
                processingTimeMs: processingTime
            });

        } catch (error) {
            totalErrors++;
            const processingTime = Date.now() - recordStartTime;
            const errorDetails = {
                message: error.message,
                stack: error.stack,
                processingTimeMs: processingTime,
                messageId: record.messageId
            };

            console.error('❌ Error processing SQS record:', errorDetails);
            errors.push({
                username: 'unknown',
                error: error.message,
                details: errorDetails
            });

            // Continue with other records even if one fails
        }
    }

    const totalTime = Date.now() - startTime;
    const summary = {
        totalProcessed,
        totalRecordsFound,
        totalErrors,
        totalTimeMs: totalTime,
        timestamp: new Date().toISOString()
    };

    console.log(`📬 Summary:`, summary);

    if (errors.length > 0) {
        console.error(`❌ Errors encountered:`, errors);
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'SQS records processed',
            summary
        })
    };
};

// Log notification history to database
const logNotificationHistory = async (username, notificationType, status, message, recordsFound) => {
    try {
        const { Client } = require('pg');

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

        // Get user ID
        const userQuery = 'SELECT id FROM users WHERE username = $1';
        const { rows: userRows } = await client.query(userQuery, [username]);

        if (userRows.length === 0) {
            console.error(`❌ User ${username} not found for notification history logging`);
            await client.end();
            return;
        }

        const userId = userRows[0].id;

        // Insert notification history
        await client.query(
            `INSERT INTO notification_history (user_id, username, notification_type, status, message, records_found, processing_date) 
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
            [userId, username, notificationType, status, message, recordsFound]
        );

        await client.end();
        console.log(`📝 Logged notification history for ${username}: ${notificationType} - ${status}`);

    } catch (error) {
        console.error(`❌ Error logging notification history for ${username}:`, error);
    }
};

// Log technical error to notification history
const logTechnicalError = async (username, notificationType, errorMessage) => {
    try {
        await logNotificationHistory(username, notificationType, 'technical_error',
            `Technical issue. Job not completed: ${errorMessage}`, 0);
    } catch (error) {
        console.error(`❌ Error logging technical error for ${username}:`, error);
    }
};
