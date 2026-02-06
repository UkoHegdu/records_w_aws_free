const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();

router.get('/feedback', (req, res) => invokeLambda(getHandler('getFeedback'), req, res));
router.post('/feedback', (req, res) => invokeLambda(getHandler('submitFeedback'), req, res));

module.exports = router;
