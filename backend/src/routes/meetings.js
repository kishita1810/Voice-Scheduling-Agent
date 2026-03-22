// backend/src/routes/meetings.js
const express = require('express');
const { body, query: queryValidator, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const {
  checkConflicts,
  suggestAlternatives,
  getMeetings,
  getAvailability,
  createMeeting,
  updateMeeting,
} = require('../services/schedulingService');
const {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require('../services/googleCalendarService');
const { query } = require('../db/connection');
const logger = require('../utils/logger');

// Validation helper
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// ── GET /meetings ─────────────────────────────────────────────────────────
// List all meetings for a user
router.get(
  '/',
  [
    queryValidator('userId').notEmpty().withMessage('userId required'),
    queryValidator('from').optional().isISO8601(),
    queryValidator('to').optional().isISO8601(),
    queryValidator('status').optional().isIn(['scheduled', 'rescheduled', 'cancelled']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, from, to, status } = req.query;
      const meetings = await getMeetings(userId, { from, to, status });
      logger.info('Meetings fetched', { userId, count: meetings.length });
      res.json({ success: true, data: meetings, count: meetings.length });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /meetings/availability ────────────────────────────────────────────
// Check availability for a user on a given date
router.get(
  '/availability',
  [
    queryValidator('userId').notEmpty(),
    queryValidator('date').isDate().withMessage('date must be YYYY-MM-DD'),
    queryValidator('timezone').optional(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, date, timezone } = req.query;
      const availability = await getAvailability(userId, date, timezone);
      res.json({ success: true, data: availability });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /meetings/schedule ───────────────────────────────────────────────
// Schedule a new meeting
router.post(
  '/schedule',
  [
    body('userId').notEmpty().withMessage('userId required'),
    body('title').notEmpty().withMessage('title required'),
    body('startTime').isISO8601().withMessage('startTime must be ISO8601'),
    body('endTime').isISO8601().withMessage('endTime must be ISO8601'),
    body('timezone').optional().isString(),
    body('accessToken').notEmpty().withMessage('Google accessToken required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, title, startTime, endTime, timezone, accessToken, notes } = req.body;

      // 1. Check for conflicts
      const conflicts = await checkConflicts(userId, startTime, endTime);
      if (conflicts.length > 0) {
        const suggestions = await suggestAlternatives(userId, startTime);
        logger.warn('Scheduling conflict detected', { userId, startTime, conflicts: conflicts.length });
        return res.status(409).json({
          success: false,
          error: 'Time slot conflicts with existing meeting',
          conflicts: conflicts.map(c => ({ id: c.id, title: c.title, start: c.start_time, end: c.end_time })),
          suggestions,
        });
      }

      // 2. Create Google Calendar event
      let googleEventId = null;
      let googleEventLink = null;
      try {
        const gcEvent = await createCalendarEvent(accessToken, {
          title,
          startDateTime: startTime,
          endDateTime: endTime,
          timezone: timezone || 'America/New_York',
          description: notes,
        });
        googleEventId = gcEvent.id;
        googleEventLink = gcEvent.htmlLink;
      } catch (gcErr) {
        logger.warn('Google Calendar creation failed, saving locally only', { error: gcErr.message });
      }

      // 3. Save to database
      const meetingId = uuidv4();
      const meeting = await createMeeting({
        id: meetingId,
        userId,
        title,
        startTime,
        endTime,
        timezone: timezone || 'America/New_York',
        googleEventId,
        googleEventLink,
      });

      logger.info('Meeting scheduled', { meetingId, userId, title, startTime });
      res.status(201).json({ success: true, data: meeting });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /meetings/reschedule ─────────────────────────────────────────────
// Reschedule an existing meeting
router.post(
  '/reschedule',
  [
    body('meetingId').notEmpty().withMessage('meetingId required'),
    body('userId').notEmpty().withMessage('userId required'),
    body('newStartTime').isISO8601().withMessage('newStartTime must be ISO8601'),
    body('newEndTime').isISO8601().withMessage('newEndTime must be ISO8601'),
    body('accessToken').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { meetingId, userId, newStartTime, newEndTime, accessToken } = req.body;

      // Get original meeting
      const rows = await query('SELECT * FROM meetings WHERE id = ? AND user_id = ?', [meetingId, userId]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Meeting not found' });
      const original = rows[0];

      // Check conflicts (excluding this meeting)
      const conflicts = await checkConflicts(userId, newStartTime, newEndTime, meetingId);
      if (conflicts.length > 0) {
        const suggestions = await suggestAlternatives(userId, newStartTime);
        return res.status(409).json({
          success: false,
          error: 'New time slot conflicts with existing meeting',
          conflicts,
          suggestions,
        });
      }

      // Update Google Calendar
      if (original.google_event_id && accessToken) {
        try {
          await updateCalendarEvent(accessToken, original.google_event_id, {
            start: { dateTime: newStartTime, timeZone: original.timezone },
            end: { dateTime: newEndTime, timeZone: original.timezone },
          });
        } catch (gcErr) {
          logger.warn('Google Calendar update failed', { error: gcErr.message });
        }
      }

      // Update DB
      const updated = await updateMeeting(meetingId, userId, {
        startTime: newStartTime,
        endTime: newEndTime,
        status: 'rescheduled',
      });

      logger.info('Meeting rescheduled', { meetingId, newStartTime });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /meetings/cancel ─────────────────────────────────────────────────
// Cancel a meeting
router.post(
  '/cancel',
  [
    body('meetingId').notEmpty(),
    body('userId').notEmpty(),
    body('accessToken').optional(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { meetingId, userId, accessToken } = req.body;

      const rows = await query('SELECT * FROM meetings WHERE id = ? AND user_id = ?', [meetingId, userId]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Meeting not found' });
      const meeting = rows[0];

      // Delete from Google Calendar
      if (meeting.google_event_id && accessToken) {
        try {
          await deleteCalendarEvent(accessToken, meeting.google_event_id);
        } catch (gcErr) {
          logger.warn('Google Calendar deletion failed', { error: gcErr.message });
        }
      }

      // Mark cancelled in DB
      const updated = await updateMeeting(meetingId, userId, { status: 'cancelled' });
      logger.info('Meeting cancelled', { meetingId, userId });
      res.json({ success: true, data: updated, message: 'Meeting cancelled' });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /meetings/:id ─────────────────────────────────────────────────────
router.get('/:id', param('id').notEmpty(), validate, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM meetings WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Meeting not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
