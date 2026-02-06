const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();
const handler = getHandler('getNotificationHistory');

router.get('/notification-history', (req, res) => invokeLambda(handler, req, res));

module.exports = router;
