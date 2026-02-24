const express = require('express');
const { invokeLambda } = require('../lambdaAdapter');
const { getHandler } = require('../config/lambdaPath');

const router = express.Router();
const handler = getHandler('get_map_records');

router.get('/latest', (req, res) => invokeLambda(handler, req, res));

module.exports = router;
