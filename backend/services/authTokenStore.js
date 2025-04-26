let accessToken = null;
let refreshToken = null;

module.exports = {
    getAccessToken: () => {
        console.log('📥 Fetching access token:'); // Log when access token is fetched
        return accessToken;
    },
    getRefreshToken: () => {
        console.log('📥 Fetching refresh token:'); // Log when access token is fetched
        return refreshToken;
    },
    setTokens: (access, refresh) => {
        accessToken = access;
        refreshToken = refresh;
        console.log('✅ Tokens received and stored.');

    }
};