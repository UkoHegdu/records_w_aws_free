const cors = require('cors');
const express = require('express');
require('dotenv').config();
const { login } = require('./services/authService');
const healthRoute = require('./routes/health');
const recordsRoutes = require('./routes/v1/records/recordsRoutes')
const userRoutes = require('./routes/v1/users/user_routes')
const pool = require('./services/db'); // your PostgreSQL pool
require('./services/scheduler'); // Start the cron job



const app = express();
const PORT = process.env.PORT || 3000;

// Allow all origins (you can restrict this later if needed)
app.use(cors());

app.use('/health', healthRoute);
app.use(express.json());
app.use('/api/v1/records', recordsRoutes);
app.use('/api/v1/users', userRoutes);

app.use((req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found, VAS?', path: req.originalUrl }); // trablšūt
});

pool.connect()
    .then(() => {
        console.log('✅ Connected to PostgreSQL');
        // Start the server *only if DB connects*
        // Call login() once at startup to get initial tokens
        //login().then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
        //    }).catch((err) => {
        //       console.error('Initial login failed:', err.message);
        //  });
    })
    .catch((err) => {
        console.error('❌ Failed to connect to PostgreSQL', err);
        process.exit(1); // exit if DB is not reachable
    });

process.on('unhandledRejection', (err) => {
    console.error('Unhandled redzhekšon:', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught eksepšon:', err);
    process.exit(1);
});