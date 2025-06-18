// routes/v1/users/accountNames.js
const httpClientOauth = require('../../../services/httpClientOauth');

const BASE_URL = 'https://api.trackmania.com';

const client = httpClientOauth(BASE_URL);

async function translateAccountNames(accountIds) {
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
        console.warn('⚠️ No account IDs provided for translation.');
        return {};
    }

    // Limit to max 50 per request per docs
    const chunks = [];
    while (accountIds.length) {
        chunks.push(accountIds.splice(0, 50));
    }

    const results = {};

    for (const chunk of chunks) {
        const params = new URLSearchParams();
        chunk.forEach(id => params.append('accountId[]', id));

        try {
            const response = await client.get(`/api/display-names?${params.toString()}`);
            Object.assign(results, response.data);
        } catch (error) {
            console.error('❌ Failed to fetch display names:', error.message);
        }
    }

    return results;
}

module.exports = { translateAccountNames };
