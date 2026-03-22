// backend/src/middleware/requestLogger.js
const logger = require('../utils/logger');
const { query } = require('../db/connection');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', async () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (res.statusCode >= 400) {
      logger.warn('API request', logData);
    } else {
      logger.info('API request', logData);
    }

    // Log to DB (non-blocking)
    try {
      await query(
        `INSERT INTO api_logs (method, path, status_code, response_time_ms, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        [req.method, req.path, res.statusCode, duration, req.userId || null]
      );
    } catch (e) {
      // Don't fail requests if logging fails
    }
  });

  next();
}

module.exports = requestLogger;
