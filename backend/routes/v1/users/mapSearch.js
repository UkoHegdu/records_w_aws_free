const { filterRecordsByPeriod } = require('../../../services/filter');
const { getRecordsFromApi } = require('../records/recordsService');
const axios = require('axios');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const RETRY_LIMIT = 5;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

const fetchWithRetry = async (fn, retries = RETRY_LIMIT) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error?.response?.data || error.message);
            if (attempt === retries) throw error;
            console.log(`Waiting ${RETRY_DELAY_MS / 60000} minutes before retrying...`);
            await sleep(RETRY_DELAY_MS);
        }
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

    await fetchWithRetry(async () => {
        let hasMore = true;
        let lastMapId = null;

        while (hasMore) {  // fetch all the maps that are in multiple pages. If just one page, the loop executes once
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
    });

    const mapsAndLeaderboards = [];

    for (const map of allResults) {   // max 2 requests per second, hence the sleep 500 in the end. Getting all the leaderboards for each map. 2 maps per second
        const leaderboard = await fetchWithRetry(() => getRecordsFromApi(map.MapUid));
        const filtered = period ? filterRecordsByPeriod(leaderboard, period) : leaderboard;

        if (filtered.length > 0) {
            mapsAndLeaderboards.push({
                mapName: map.Name,
                leaderboard: filtered
            });
        }

        await sleep(500); // TM DOC specified, do not change
    }

    return mapsAndLeaderboards;
};

module.exports = { fetchMapsAndLeaderboards };