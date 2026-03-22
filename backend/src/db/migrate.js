// backend/src/db/migrate.js
require('dotenv').config();
const { pool } = require('./connection');
const logger = require('../utils/logger');

const migrations = [
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    google_access_token TEXT,
    google_refresh_token TEXT,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    preferred_duration INT DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // Meetings table
  `CREATE TABLE IF NOT EXISTS meetings (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Meeting',
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    status ENUM('scheduled', 'rescheduled', 'cancelled') DEFAULT 'scheduled',
    google_event_id VARCHAR(255),
    google_event_link TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status)
  )`,

  // User preferences table
  `CREATE TABLE IF NOT EXISTS user_preferences (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    preferred_meeting_duration INT DEFAULT 60,
    preferred_start_hour INT DEFAULT 9,
    preferred_end_hour INT DEFAULT 17,
    buffer_minutes INT DEFAULT 15,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // API logs table
  `CREATE TABLE IF NOT EXISTS api_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    method VARCHAR(10),
    path VARCHAR(255),
    status_code INT,
    response_time_ms INT,
    user_id VARCHAR(36),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_status_code (status_code)
  )`,
];

async function migrate() {
  logger.info('Running database migrations...');
  for (const sql of migrations) {
    try {
      await pool.execute(sql);
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      logger.info(`✅ Table ready: ${tableName}`);
    } catch (err) {
      logger.error('Migration failed', { error: err.message, sql: sql.slice(0, 80) });
      process.exit(1);
    }
  }
  logger.info('All migrations complete');
  process.exit(0);
}

migrate();
