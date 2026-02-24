const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();

router.get('/config', (req, res) => invokeLambda(getHandler('getAdminConfig'), req, res));
router.put('/config', (req, res) => invokeLambda(getHandler('updateAdminConfig'), req, res));
router.get('/users', (req, res) => invokeLambda(getHandler('getAdminUsers'), req, res));
router.put('/users/alert-type', (req, res) => invokeLambda(getHandler('updateUserAlertType'), req, res));
router.get('/daily-overview', (req, res) => invokeLambda(getHandler('getAdminDailyOverview'), req, res));

module.exports = router;
