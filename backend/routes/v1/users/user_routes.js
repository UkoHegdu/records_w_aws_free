const express = require('express');
const router = express.Router();
const { userSearchF } = require('./user_search');
const { fetchMapsAndLeaderboards } = require('./mapSearch');
const { create_alertF } = require('./create_alert');


// Route to get filtered records by mapUid and period (day, week, month)
router.get('/search', userSearchF);  //handles the /api/users/search path
router.get('/maps', fetchMapsAndLeaderboards);  //handles the /api/users/maps path
router.post('/create_alert', create_alertF);  //handles the /api/users/alerts path



module.exports = router;
