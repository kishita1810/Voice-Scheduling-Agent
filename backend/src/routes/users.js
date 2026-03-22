// backend/src/routes/users.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/connection');
const logger = require('../utils/logger');
const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
}

// ── POST /users ───────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('name required'),
    body('email').optional().isEmail(),
    body('timezone').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, timezone } = req.body;
      const id = uuidv4();

      await query(
        `INSERT INTO users (id, name, email, timezone) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), timezone = VALUES(timezone)`,
        [id, name, email || null, timezone || 'America/New_York']
      );

      // Create default preferences
      await query(
        `INSERT IGNORE INTO user_preferences (id, user_id) VALUES (?, ?)`,
        [uuidv4(), id]
      );

      const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
      logger.info('User created', { userId: id, name });
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /users/:id ────────────────────────────────────────────────────────
router.get('/:id', param('id').notEmpty(), validate, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT u.*, up.preferred_meeting_duration, up.preferred_start_hour,
              up.preferred_end_hour, up.buffer_minutes
       FROM users u
       LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /users/:id/preferences ─────────────────────────────────────────
router.patch('/:id/preferences', async (req, res, next) => {
  try {
    const { preferredDuration, preferredStartHour, preferredEndHour, bufferMinutes, timezone } = req.body;
    const fields = [];
    const params = [];

    if (preferredDuration) { fields.push('preferred_meeting_duration = ?'); params.push(preferredDuration); }
    if (preferredStartHour !== undefined) { fields.push('preferred_start_hour = ?'); params.push(preferredStartHour); }
    if (preferredEndHour !== undefined) { fields.push('preferred_end_hour = ?'); params.push(preferredEndHour); }
    if (bufferMinutes !== undefined) { fields.push('buffer_minutes = ?'); params.push(bufferMinutes); }
    if (timezone) { fields.push('timezone = ?'); params.push(timezone); }

    if (fields.length) {
      params.push(req.params.id);
      await query(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`, params);
    }

    const rows = await query('SELECT * FROM user_preferences WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
