/**
 * Path to lambda handlers (copied into backend for a self-contained backend).
 */
const path = require('path');

const LAMBDA_DIR = path.resolve(__dirname, '../lambda');

function getHandler(moduleName) {
  // moduleName e.g. 'login', 'create_alert', 'getUserProfile'
  const fileMap = {
    login: 'login.js',
    register: 'register.js',
    logout: 'logout.js',
    refreshToken: 'refreshToken.js',
    user_search: 'user_search.js',
    mapSearch: 'mapSearch.js',
    checkJobStatus: 'checkJobStatus.js',
    create_alert: 'create_alert.js',
    get_map_records: 'getMapRecords.js',
    accountNames: 'accountNames.js',
    getUserProfile: 'getUserProfile.js',
    verifyTmUsername: 'verifyTmUsername.js',
    mapSearchDriver: 'mapSearchDriver.js',
    driverNotifications: 'driverNotifications.js',
    getAdminConfig: 'getAdminConfig.js',
    updateAdminConfig: 'updateAdminConfig.js',
    getAdminUsers: 'getAdminUsers.js',
    updateUserAlertType: 'updateUserAlertType.js',
    getNotificationHistory: 'getNotificationHistory.js',
    getAdminDailyOverview: 'getAdminDailyOverview.js',
    getSiteStats: 'getSiteStats.js',
    health: 'health.js',
    test: 'test.js',
    testAdvanced: 'testAdvanced.js',
    submitFeedback: 'submitFeedback.js',
    getFeedback: 'getFeedback.js',
    markFeedbackRead: 'markFeedbackRead.js',
    deleteFeedback: 'deleteFeedback.js'
  };
  const file = fileMap[moduleName] || `${moduleName}.js`;
  const mod = require(path.join(LAMBDA_DIR, file));
  return mod.handler;
}

module.exports = { LAMBDA_DIR, getHandler };
