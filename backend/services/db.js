// backend/db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool(); // Uses env variables automatically

module.exports = pool;