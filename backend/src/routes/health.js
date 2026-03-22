// backend/src/routes/health.js
const express = require('express');
const { pool } = require('../db/connection');
const router = express.Router();

router.get('/', async (req, res) => {
  const start = Date.now();
  let dbStatus = 'ok';

  try {
    await pool.execute('SELECT 1');
  } catch (e) {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    latency: `${Date.now() - start}ms`,
    version: '2.0.0',
  });
});

module.exports = router;
