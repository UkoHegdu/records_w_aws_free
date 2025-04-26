const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
});

module.exports = router;