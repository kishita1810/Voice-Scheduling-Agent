-- database/schema.sql
-- ARIA Voice Scheduler — MySQL Schema
-- Run: mysql -u root -p aria_scheduler < database/schema.sql

CREATE DATABASE IF NOT EXISTS aria_scheduler
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aria_scheduler;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)   PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  UNIQUE,
  google_access_token  TEXT,
  google_refresh_token TEXT,
  timezone      VARCHAR(50)   DEFAULT 'America/New_York',
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id                VARCHAR(36)   PRIMARY KEY,
  user_id           VARCHAR(36)   NOT NULL,
  title             VARCHAR(255)  NOT NULL DEFAULT 'Meeting',
  start_time        DATETIME      NOT NULL,
  end_time          DATETIME      NOT NULL,
  timezone          VARCHAR(50)   DEFAULT 'America/New_York',
  status            ENUM('scheduled','rescheduled','cancelled') DEFAULT 'scheduled',
  google_event_id   VARCHAR(255),
  google_event_link TEXT,
  notes             TEXT,
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_meetings_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user_id   (user_id),
  INDEX idx_start     (start_time),
  INDEX idx_status    (status)
);

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id                        VARCHAR(36)  PRIMARY KEY,
  user_id                   VARCHAR(36)  NOT NULL UNIQUE,
  preferred_meeting_duration INT         DEFAULT 60,
  preferred_start_hour       INT         DEFAULT 9,
  preferred_end_hour         INT         DEFAULT 17,
  buffer_minutes             INT         DEFAULT 15,
  timezone                   VARCHAR(50) DEFAULT 'America/New_York',
  created_at                 TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_prefs_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- API Request Logs
CREATE TABLE IF NOT EXISTS api_logs (
  id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
  method          VARCHAR(10),
  path            VARCHAR(255),
  status_code     INT,
  response_time_ms INT,
  user_id         VARCHAR(36),
  error_message   TEXT,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_created  (created_at),
  INDEX idx_status   (status_code)
);
