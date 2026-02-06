const express = require('express');
const cors = require('cors');
const { invokeLambda } = require('./lambdaAdapter');
const { getHandler } = require('./config/lambdaPath');

const health = require('./routes/health');
const users = require('./routes/users');
const records = require('./routes/records');
const driver = require('./routes/driver');
const admin = require('./routes/admin');
const notificationHistory = require('./routes/notificationHistory');
const feedback = require('./routes/feedback');
const test = require('./routes/test');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Security headers (mirror Lambda responses)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health (no /api/v1 prefix to match common usage)
app.use('/health', health);

// API v1 - same path structure as API Gateway
app.use('/api/v1/users', users);
app.use('/api/v1/records', records);
app.use('/api/v1/driver', driver);
app.use('/api/v1/admin', admin);
app.use('/api/v1', notificationHistory);
app.use('/api/v1', feedback);
app.use('/api/v1', test);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ msg: 'Internal server error' });
});

module.exports = app;
