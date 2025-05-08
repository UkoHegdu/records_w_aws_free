// (Contains business logic, e.g., interacting with the database)

const axios = require('axios');
const httpClient = require('../../../services/httpClient');
const client = httpClient(process.env.LEAD_API);


// Fetch records from the external Trackmania API
const getRecordsFromApi = async (mapUid) => {
    const url = `/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?onlyWorld=true&length=100`;
    console.log('getrecordsfrom api called');
    try {

        const response = await client.get(url);
        return response.data;  // Return the API response data

    } catch (err) {
        console.error('Error fetching records from Trackmania API :((((((((((:', err.message);
        throw new Error('wtf omg kļūda');
    }
};

module.exports = { getRecordsFromApi };
