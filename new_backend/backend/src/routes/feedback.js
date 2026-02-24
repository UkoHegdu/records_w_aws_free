const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();

router.get('/feedback', (req, res) => invokeLambda(getHandler('getFeedback'), req, res));
router.post('/feedback', (req, res) => invokeLambda(getHandler('submitFeedback'), req, res));
router.put('/feedback/:id/read', (req, res) => invokeLambda(getHandler('markFeedbackRead'), req, res));
router.delete('/feedback/:id', (req, res) => invokeLambda(getHandler('deleteFeedback'), req, res));

module.exports = router;
