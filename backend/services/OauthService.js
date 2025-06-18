// OauthService.js
const axios = require('axios');
const qs = require('qs');
const tokenStore = require('./authTokenStore');

async function loginOauth() {
    try {
        const clientId = process.env.OCLIENT_ID;
        const clientSecret = process.env.OCLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('OAuth client ID or secret is missing from environment variables.');
        }

        const response = await axios.post(
            'https://api.trackmania.com/api/access_token',
            qs.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        const { access_token, expires_in } = response.data;

        if (!access_token) {
            console.error('⚠️ OAuth login succeeded but no token was returned.');
            return;
        }

        tokenStore.setTokens('oauth2', access_token, null); //careful to change this, might throw the app for an infinite loop
        console.log(`✅ OAuth2 token fetched (valid for ${expires_in}s)`);
    } catch (err) {
        if (err.response) {
            console.error(`❌ OAuth login failed with status ${err.response.status}:`, err.response.data);
        } else if (err.request) {
            console.error('❌ OAuth request made, but no response received:', err.request);
        } else {
            console.error('❌ Unexpected error during OAuth login:', err.message);
        }
        throw err;
    }
}

module.exports = { loginOauth };
