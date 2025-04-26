const express = require('express');
const router = express.Router();
const { getMapRecords } = require('./recordsController');

// Route to get filtered records by mapUid and period (day, week, month)
router.get('/latest', getMapRecords);  //handles the /api/records/latest path

module.exports = router;
