#!/usr/bin/env node
/**
 * Copy handler and shared files from backend/src/lambda/ to terraform/lambda/.
 * Run from repo root after editing backend/src/lambda/ so AWS Lambda gets the same code.
 * Usage: node backend/scripts/sync-lambda-to-terraform.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(REPO_ROOT, 'backend/src/lambda');
const DST = path.join(REPO_ROOT, 'terraform/lambda');

const FILES = [
  'accountNames.js', 'checkDriverPositions.js', 'checkJobStatus.js', 'checkMapPositions.js',
  'create_alert.js', 'driverNotificationProcessor.js', 'driverNotifications.js',
  'driverNotificationStatusCheck.js', 'emailSender.js', 'getAdminConfig.js',
  'getAdminDailyOverview.js', 'getAdminUsers.js', 'getFeedback.js', 'getMapRecords.js',
  'getNotificationHistory.js', 'getUserProfile.js', 'health.js', 'login.js', 'logout.js',
  'mapSearch.js', 'mapSearchBackground.js', 'mapSearchDriver.js', 'refreshToken.js',
  'register.js', 'scheduler.js', 'schedulerProcessor.js', 'securityUtils.js',
  'submitFeedback.js', 'test.js', 'testAdvanced.js', 'updateAdminConfig.js',
  'updateUserAlertType.js', 'user_search.js', 'verifyTmUsername.js'
];

const SHARED = ['apiClient.js', 'oauthApiClient.js', 'timeFormatter.js'];

function copy(srcPath, dstPath) {
  const content = fs.readFileSync(srcPath, 'utf8');
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.writeFileSync(dstPath, content);
}

let copied = 0;
for (const f of FILES) {
  const src = path.join(SRC, f);
  const dst = path.join(DST, f);
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', f);
    continue;
  }
  copy(src, dst);
  console.log('Copied:', f);
  copied++;
}
for (const f of SHARED) {
  const src = path.join(SRC, 'shared', f);
  const dst = path.join(DST, 'shared', f);
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing): shared/' + f);
    continue;
  }
  copy(src, dst);
  console.log('Copied: shared/' + f);
  copied++;
}
console.log('Done. Copied', copied, 'files to terraform/lambda/');
