//(Contains logic for handling requests)
const { getRecordsFromApi } = require('./recordsService');

// Controller to fetch and filter the leaderboard data
const getMapRecords = async (req, res) => {
    const { mapUid, period } = req.query;  // mapUid, period (e.g., '1d', '1w', '1m')

    console.log('🔥 getMapRecords called'); //trablšūts

    if (!mapUid || !period) {          //obligāti vajag mapuid un periodu
        return res.status(400).json({ error: 'Missing required query parameters: mapUid or period' });
    }

    try {
        // Fetch the leaderboard data from the external API
        const leaderboardData = await getRecordsFromApi(mapUid);

        // Filter the data by the period specified by the user (day/week/month)
        const filteredRecords = filterRecordsByPeriod(leaderboardData, period);

        return res.json(filteredRecords);
    } catch (err) {
        console.error('Error fetching leaderboard data:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Helper function to filter records based on the period
const filterRecordsByPeriod = (data, period) => {
    const now = Date.now();
    let timeThreshold;

    console.log(`apstraadaajam filtru ar ${period}`); //troubleshooting

    switch (period) {
        case '1d':
            timeThreshold = 24 * 60 * 60 * 1000;  // 1 day in milliseconds
            break;
        case '1w':
            timeThreshold = 7 * 24 * 60 * 60 * 1000;  // 1 week in milliseconds
            break;
        case '1m':
            timeThreshold = 30 * 24 * 60 * 60 * 1000;  // 1 month in milliseconds
            break;
        default:
            return [];  // Return an empty array if the period is invalid
    }

    // Filter top records by timestamp
    return data.tops.flatMap(group =>
        group.top.filter(record => {
            const recordTime = record.timestamp * 1000;  // Convert to milliseconds
            return now - recordTime <= timeThreshold;  // Check if the record is within the time threshold
        })
    );
};

module.exports = { getMapRecords };
