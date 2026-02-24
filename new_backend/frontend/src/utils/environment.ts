// Environment detection utility
export const isTestEnvironment = (): boolean => {
    // Check for test environment indicators
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isTestDomain = hostname.includes('test') || hostname.includes('staging');
    const isTestEnvVar = import.meta.env.VITE_ENVIRONMENT === 'test';

    return isLocalhost || isTestDomain || isTestEnvVar;
};

export const getEnvironmentName = (): string => {
    if (isTestEnvironment()) {
        return 'test';
    }
    return 'production';
};

export const getEnvironmentDisplayName = (): string => {
    if (isTestEnvironment()) {
        return 'Test Environment';
    }
    return 'Production';
};
