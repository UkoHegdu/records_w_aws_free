const tokens = {
    auth: { accessToken: null, refreshToken: null },
    oauth2: { accessToken: null, refreshToken: null },
};


module.exports = {
    getAccessToken: (provider) => tokens[provider]?.accessToken,
    getRefreshToken: (provider) => tokens[provider]?.refreshToken,
    setTokens: (provider, access, refresh) => {
        tokens[provider] = { accessToken: access, refreshToken: refresh };
        console.log(`✅ Tokens received and stored for ${provider}`);
    }
};