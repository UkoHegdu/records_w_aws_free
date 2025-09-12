// lambda/mapSearchDriver.js
const axios = require('axios');

const BASE_URL = 'https://trackmania.exchange/api/maps';

// Rate limiting: Track user requests per minute
const userRequestCounts = new Map();
const RATE_LIMIT_PER_MINUTE = 5; // Allow 5 requests per minute per user

const isRateLimited = (userId) => {
    const now = Date.now();
    const userKey = userId.toString();

    if (!userRequestCounts.has(userKey)) {
        userRequestCounts.set(userKey, []);
    }

    const requests = userRequestCounts.get(userKey);

    // Remove requests older than 1 minute
    const oneMinuteAgo = now - 60000;
    const recentRequests = requests.filter(timestamp => timestamp > oneMinuteAgo);

    if (recentRequests.length >= RATE_LIMIT_PER_MINUTE) {
        return true;
    }

    // Add current request
    recentRequests.push(now);
    userRequestCounts.set(userKey, recentRequests);

    return false;
};

exports.handler = async (event, context) => {
    console.log('🗺️ mapSearchDriver Lambda triggered!', event);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    // Handle GET request
    if (event.httpMethod === 'GET') {
        const { query, type, page = 1 } = event.queryStringParameters || {};

        if (!query || !type) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: 'Missing required parameters: query and type (name|uid)'
                })
            };
        }

        // Validate query length
        if (query.length < 3) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: 'Query must be at least 3 characters long'
                })
            };
        }

        // Get user ID from JWT token for rate limiting
        const userId = getUserIdFromToken(event);
        if (!userId) {
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        // Check rate limiting
        if (isRateLimited(userId)) {
            return {
                statusCode: 429,
                headers: headers,
                body: JSON.stringify({
                    error: 'Rate limit exceeded. Please wait before making another request.',
                    retryAfter: 60
                })
            };
        }

        try {
            const results = await searchMaps(query, type, page);

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify(results)
            };

        } catch (error) {
            console.error('Error searching maps:', error);
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ error: 'Internal Server Error' })
            };
        }
    }

    return {
        statusCode: 405,
        headers: headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};

// Helper function to extract user ID from JWT token
const getUserIdFromToken = (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.user_id;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
};

// Search maps using Trackmania Exchange API
const searchMaps = async (query, type, page) => {
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    let params = {
        fields: 'MapId,MapUid,Name,Authors,UploadedAt,DownloadCount',
        limit: pageSize,
        offset: offset
    };

    // Add search parameter based on type
    if (type === 'name') {
        params.name = query;
    } else if (type === 'uid') {
        params.mapUid = query;
    } else {
        throw new Error('Invalid search type. Must be "name" or "uid"');
    }

    try {
        console.log(`🔍 Searching maps with params:`, params);

        const response = await axios.get(BASE_URL, { params });
        const data = response.data;

        console.log(`📊 API Response: ${data.Results?.length || 0} results, More: ${data.More}`);

        // Check if too many results (more than 100 total)
        if (data.Results && data.Results.length > 0) {
            const totalResults = offset + data.Results.length;
            if (totalResults > 100) {
                return {
                    error: 'Too many possible results. Please narrow down your search or use search by UID.',
                    results: [],
                    pagination: {
                        currentPage: page,
                        pageSize: pageSize,
                        hasMore: false,
                        totalResults: 0
                    }
                };
            }
        }

        // Format results for frontend
        const formattedResults = (data.Results || []).map(map => ({
            mapId: map.MapId,
            mapUid: map.MapUid,
            name: map.Name,
            authors: map.Authors?.map(author => author.User?.Name).filter(Boolean) || [],
            medals: null, // Medals field not available in Trackmania Exchange API
            uploadedAt: map.UploadedAt,
            downloadCount: map.DownloadCount
        }));

        return {
            results: formattedResults,
            pagination: {
                currentPage: page,
                pageSize: pageSize,
                hasMore: data.More || false,
                totalResults: formattedResults.length
            }
        };

    } catch (error) {
        console.error('Trackmania Exchange API error:', error.response?.data || error.message);

        if (error.response?.status === 404) {
            return {
                results: [],
                pagination: {
                    currentPage: page,
                    pageSize: pageSize,
                    hasMore: false,
                    totalResults: 0
                }
            };
        }

        throw error;
    }
};
