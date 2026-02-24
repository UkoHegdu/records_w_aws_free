const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();
router.get('/stats', (req, res) => invokeLambda(getHandler('getSiteStats'), req, res));

module.exports = router;
