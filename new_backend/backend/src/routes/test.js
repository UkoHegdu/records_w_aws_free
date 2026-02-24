const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();
const testHandler = getHandler('test');
const testAdvancedHandler = getHandler('testAdvanced');

router.get('/test', (req, res) => invokeLambda(testHandler, req, res));
router.post('/test', (req, res) => invokeLambda(testHandler, req, res));
router.get('/test-advanced', (req, res) => invokeLambda(testAdvancedHandler, req, res));
router.post('/test-advanced', (req, res) => invokeLambda(testAdvancedHandler, req, res));

module.exports = router;
