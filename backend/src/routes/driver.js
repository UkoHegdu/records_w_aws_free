const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();
const driverNotificationsHandler = getHandler('driverNotifications');
const mapSearchDriverHandler = getHandler('mapSearchDriver');

router.get('/maps/search', (req, res) => invokeLambda(mapSearchDriverHandler, req, res));
router.get('/notifications', (req, res) => invokeLambda(driverNotificationsHandler, req, res));
router.post('/notifications', (req, res) => invokeLambda(driverNotificationsHandler, req, res));
router.delete('/notifications/:id', (req, res) => invokeLambda(driverNotificationsHandler, req, res));

module.exports = router;
