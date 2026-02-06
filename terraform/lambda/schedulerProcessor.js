// lambda/schedulerProcessor.js - Processes queued user checks in two phases with caching
const { fetchMapsAndLeaderboards } = require('./mapSearch');
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

        // Get user's alert type
        const alertQuery = `
            SELECT a.alert_type, a.map_count
            FROM alerts a
            JOIN users u ON a.user_id = u.id
            WHERE u.username = $1
        `;

        const { rows: alertRows } = await client.query(alertQuery, [username]);

        if (alertRows.length === 0) {
            console.log(`ℹ️ No alerts found for ${username}`);
            await client.end();
            return { success: true, recordsFound: 0, phase: 1 };
        }

        const { alert_type, map_count } = alertRows[0];
        console.log(`📊 User ${username} has ${map_count} maps with ${alert_type} mode`);

        // Check if map count exceeds limit and auto-switch to inaccurate mode
        const maxMapsLimit = parseInt(process.env.MAX_MAPS_PER_USER || '200');
        let finalAlertType = alert_type;

        if (alert_type === 'accurate' && map_count > maxMapsLimit) {
            console.log(`⚠️ User ${username} has ${map_count} maps, exceeding limit of ${maxMapsLimit}. Auto-switching to inaccurate mode.`);

            // Update alert type in database
            await client.query(
                'UPDATE alerts SET alert_type = $1 WHERE user_id = (SELECT id FROM users WHERE username = $2)',
                ['inaccurate', username]
            );

            finalAlertType = 'inaccurate';

            // Log this change
            await logNotificationHistory(username, 'mapper_alert', 'technical_error',
                `Auto-switched to inaccurate mode due to ${map_count} maps exceeding limit of ${maxMapsLimit}`, 0);
        }

        let newRecords = [];
        let mapperContent = '';

        if (finalAlertType === 'accurate') {
            // Traditional accurate mode - fetch full leaderboards
            console.log(`🎯 Processing ${username} in accurate mode`);
            // fetchMapsAndLeaderboards already has retry logic built in, no need to wrap in withRetry
            newRecords = await fetchMapsAndLeaderboards(username, '1d');

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
            newRecords = await processInaccurateMode(username, client);

            if (newRecords.length > 0) {
                console.log(`📊 Found ${newRecords.length} new records for ${username}`);
                mapperContent = await formatNewRecords(newRecords);
            } else {
                console.log(`ℹ️ No new records for ${username}`);
            }
        }

        await client.end();

        // Save email body to DynamoDB (will be sent later by email sender)
        await saveEmailBodyToDynamoDB(username, username, email, mapperContent);

        // Log notification history
        await logNotificationHistory(username, 'mapper_alert', newRecords.length > 0 ? 'sent' : 'no_new_times',
            newRecords.length > 0 ? `Notification sent for ${newRecords.length} new times!` : 'No new notifications were sent',
            newRecords.length);

        return { success: true, recordsFound: newRecords.length, phase: 1, alert_type: finalAlertType };
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

// Process inaccurate mode using position API
const processInaccurateMode = async (username, client) => {
    console.log(`⚡ Processing inaccurate mode for ${username}`);

    try {
        // Get user's map UIDs
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
            return [];
        }

        console.log(`🗺️ Checking positions for ${mapUids.length} maps`);

        // Import the position checking function
        const { checkMapPositions } = require('./checkMapPositions');

        // Check positions efficiently using position API
        const positionResults = await withRetry(
            () => checkMapPositions(mapUids),
            `Position check for ${mapUids.length} maps`
        );

        const changedMaps = [];

        // Compare with stored positions
        for (const result of positionResults) {
            if (!result.found) continue; // Skip maps with no position data

            // Get stored position for this map
            const positionQuery = `
                SELECT position, score
                FROM map_positions
                WHERE map_uid = $1
            `;

            const { rows: positionRows } = await client.query(positionQuery, [result.map_uid]);

            if (positionRows.length === 0) {
                // First time checking this map - store initial position
                await client.query(
                    'INSERT INTO map_positions (map_uid, position, score, last_checked) VALUES ($1, $2, $3, NOW())',
                    [result.map_uid, result.position, result.score]
                );
                console.log(`📝 Initialized position for map ${result.map_uid}: ${result.position}`);
                continue;
            }

            const storedPosition = positionRows[0];

            // Check if position has changed (new players)
            if (result.position !== storedPosition.position) {
                console.log(`🎯 Position changed for map ${result.map_uid}: ${storedPosition.position} → ${result.position}`);

                // Update stored position
                await client.query(
                    'UPDATE map_positions SET position = $1, score = $2, last_checked = NOW() WHERE map_uid = $3',
                    [result.position, result.score, result.map_uid]
                );

                // Fetch full leaderboard for this map
                const leaderboardData = await fetchLeaderboardForMap(result.map_uid);

                if (leaderboardData && leaderboardData.length > 0) {
                    changedMaps.push({
                        mapId: result.map_uid,
                        mapName: `Map ${result.map_uid}`, // We'll need to get actual map name
                        leaderboard: leaderboardData,
                        newPlayers: result.position - storedPosition.position
                    });
                }
            }
        }

        console.log(`📊 Found ${changedMaps.length} maps with new players`);
        return changedMaps;

    } catch (error) {
        console.error(`❌ Error processing inaccurate mode for ${username}:`, error);
        throw error;
    }
};

// Fetch leaderboard for a specific map
const fetchLeaderboardForMap = async (mapUid) => {
    try {
        // This would use the existing mapSearch logic to fetch leaderboard
        // For now, return empty array - this needs to be implemented
        console.log(`🔄 Fetching leaderboard for map ${mapUid}`);
        return [];
    } catch (error) {
        console.error(`❌ Error fetching leaderboard for map ${mapUid}:`, error);
        return [];
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
