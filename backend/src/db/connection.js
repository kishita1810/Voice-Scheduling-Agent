// backend/src/db/connection.js
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'aria_scheduler',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    logger.info('✅ MySQL connected', {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    });
    conn.release();
  })
  .catch(err => {
    logger.error('❌ MySQL connection failed', { error: err.message });
  });

// Helper: run a query with automatic logging and retry
async function query(sql, params = [], retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (err) {
      if (i === retries - 1) throw err;
      logger.warn(`DB query retry ${i + 1}/${retries}`, { error: err.message });
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

module.exports = { pool, query };
