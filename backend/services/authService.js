const axios = require('axios');
const tokenStore = require('./authTokenStore');

async function login() {
    try {
        const credentials = Buffer.from(`${process.env.AUTHORIZATION}`); //parole

        //trablshooting
        console.log('📤 Sending login request with headers:', {
            Authorization: `Basic ${credentials}`, // mask credentials for safety
            'Content-Type': 'application/json',
            'User-Agent': process.env.USER_AGENT
        });

        console.log('📦 Request body:', { audience: 'NadeoLiveServices' });
        console.log('🌐 Auth API URL:', process.env.AUTH_API_URL);
        //./trabshuuting end

        const response = await axios.post(`${process.env.AUTH_API_URL}`,  //auth pieprasījums, kas ir arī postmenā
            { audience: 'NadeoLiveServices' },
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json',
                    'User-Agent': `${process.env.USER_AGENT}`
                }
            }
        );

        const { accessToken, refreshToken } = response.data;

        if (!accessToken || !refreshToken) {                             // errorz handling
            console.error('⚠️ Login successful but tokens are missing in response!');
            return;
        }

        tokenStore.setTokens(accessToken, refreshToken);
        console.log('✅ Logged in successfully. Tokens set.');
    } catch (error) {
        if (error.response) {
            console.error(`❌ Login failed with status ${error.response.status}:`, error.response.data);
        } else if (error.request) {
            console.error('❌ Login request made, but no response received:', error.request);
        } else {
            console.error('❌ Unexpected error during login:', error.message);
        }
    }
}

module.exports = { login };
