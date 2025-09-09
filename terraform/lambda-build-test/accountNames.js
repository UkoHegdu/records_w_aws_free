// lambda/accountNames.js
const { createOAuth2Client } = require('./httpClientOauth');

const BASE_URL = 'https://api.trackmania.com';

exports.handler = async (event, context) => {
    console.log('👤 accountNames Lambda triggered!', event);

    try {
        // Parse the request body or query parameters
        let accountIds;

        if (event.body) {
            const body = JSON.parse(event.body);
            accountIds = body.accountIds;
        } else if (event.queryStringParameters?.accountIds) {
            // Handle comma-separated string from query parameters
            accountIds = event.queryStringParameters.accountIds.split(',').map(id => id.trim());
        } else {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'accountIds parameter required' })
            };
        }

        const result = await translateAccountNames(accountIds);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error in accountNames Lambda:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};

async function translateAccountNames(accountIds) {
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
        console.warn('⚠️ No account IDs provided for translation.');
        return {};
    }

    // Create OAuth2 authenticated client
    const client = createOAuth2Client(BASE_URL);

    // Limit to max 50 per request per docs
    const chunks = [];
    const accountIdsCopy = [...accountIds]; // Create a copy to avoid modifying original array
    while (accountIdsCopy.length) {
        chunks.push(accountIdsCopy.splice(0, 50));
    }

    const results = {};

    for (const chunk of chunks) {
        const params = new URLSearchParams();
        chunk.forEach(id => params.append('accountId[]', id));

        try {
            console.log(`🔍 Fetching display names for ${chunk.length} account IDs...`);
            const response = await client.get(`/api/display-names?${params.toString()}`);
            Object.assign(results, response.data);
            console.log(`✅ Successfully fetched ${Object.keys(response.data).length} display names`);
        } catch (error) {
            console.error('❌ Failed to fetch display names:', error.message);
            // Continue with other chunks even if one fails
        }
    }

    console.log(`🎯 Total display names fetched: ${Object.keys(results).length}`);
    return results;
}
