// backend/src/services/schedulingService.js
const { query } = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Check if a time slot conflicts with existing meetings for a user
 */
async function checkConflicts(userId, startTime, endTime, excludeMeetingId = null) {
  let sql = `
    SELECT id, title, start_time, end_time
    FROM meetings
    WHERE user_id = ?
      AND status != 'cancelled'
      AND (
        (start_time < ? AND end_time > ?)
        OR (start_time >= ? AND start_time < ?)
        OR (end_time > ? AND end_time <= ?)
      )
  `;
  const params = [userId, endTime, startTime, startTime, endTime, startTime, endTime];

  if (excludeMeetingId) {
    sql += ' AND id != ?';
    params.push(excludeMeetingId);
  }

  const conflicts = await query(sql, params);
  return conflicts;
}

/**
 * Suggest alternative time slots if there's a conflict
 */
async function suggestAlternatives(userId, requestedStart, durationMinutes = 60) {
  const suggestions = [];
  const start = new Date(requestedStart);

  // Try slots: +1h, +2h, -1h, next day same time, +1 day +1h
  const offsets = [
    60, 120, -60, 24 * 60, 24 * 60 + 60, 24 * 60 - 60, 2 * 24 * 60
  ];

  for (const offsetMins of offsets) {
    const candidateStart = new Date(start.getTime() + offsetMins * 60 * 1000);
    const candidateEnd = new Date(candidateStart.getTime() + durationMinutes * 60 * 1000);

    // Skip outside business hours (8am - 8pm)
    const hour = candidateStart.getUTCHours();
    if (hour < 8 || hour >= 20) continue;

    const conflicts = await checkConflicts(userId, candidateStart, candidateEnd);
    if (conflicts.length === 0) {
      suggestions.push({
        start: candidateStart.toISOString(),
        end: candidateEnd.toISOString(),
        label: formatSuggestionLabel(candidateStart, offsetMins),
      });
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions;
}

function formatSuggestionLabel(date, offsetMins) {
  const absMins = Math.abs(offsetMins);
  const direction = offsetMins > 0 ? 'later' : 'earlier';
  if (absMins < 60) return `${absMins} min ${direction}`;
  if (absMins < 24 * 60) return `${absMins / 60}h ${direction}`;
  const days = Math.floor(absMins / (24 * 60));
  return `${days} day${days > 1 ? 's' : ''} later`;
}

/**
 * Get all meetings for a user in a date range
 */
async function getMeetings(userId, { from, to, status } = {}) {
  let sql = `
    SELECT id, title, start_time, end_time, timezone, status,
           google_event_id, google_event_link, notes, created_at
    FROM meetings
    WHERE user_id = ?
  `;
  const params = [userId];

  if (from) { sql += ' AND start_time >= ?'; params.push(from); }
  if (to) { sql += ' AND start_time <= ?'; params.push(to); }
  if (status) { sql += ' AND status = ?'; params.push(status); }

  sql += ' ORDER BY start_time ASC';

  return query(sql, params);
}

/**
 * Get user availability — returns free slots in a day
 */
async function getAvailability(userId, date, timezone = 'America/New_York') {
  const dayStart = new Date(`${date}T08:00:00`);
  const dayEnd = new Date(`${date}T20:00:00`);

  const booked = await query(
    `SELECT start_time, end_time, title FROM meetings
     WHERE user_id = ? AND status != 'cancelled'
     AND start_time >= ? AND end_time <= ?
     ORDER BY start_time`,
    [userId, dayStart, dayEnd]
  );

  // Build free slots from booked meetings
  const freeSlots = [];
  let cursor = dayStart;

  for (const mtg of booked) {
    const mtgStart = new Date(mtg.start_time);
    if (mtgStart > cursor) {
      freeSlots.push({ start: cursor.toISOString(), end: mtgStart.toISOString(), durationMinutes: (mtgStart - cursor) / 60000 });
    }
    cursor = new Date(mtg.end_time);
  }

  if (cursor < dayEnd) {
    freeSlots.push({ start: cursor.toISOString(), end: dayEnd.toISOString(), durationMinutes: (dayEnd - cursor) / 60000 });
  }

  return {
    date,
    timezone,
    bookedMeetings: booked,
    freeSlots: freeSlots.filter(s => s.durationMinutes >= 30),
  };
}

/**
 * Create a meeting in the database
 */
async function createMeeting({ id, userId, title, startTime, endTime, timezone, googleEventId, googleEventLink }) {
  await query(
    `INSERT INTO meetings (id, user_id, title, start_time, end_time, timezone, google_event_id, google_event_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, title, startTime, endTime, timezone, googleEventId || null, googleEventLink || null]
  );
  const rows = await query('SELECT * FROM meetings WHERE id = ?', [id]);
  return rows[0];
}

/**
 * Update a meeting (reschedule)
 */
async function updateMeeting(meetingId, userId, { title, startTime, endTime, status }) {
  const fields = [];
  const params = [];

  if (title) { fields.push('title = ?'); params.push(title); }
  if (startTime) { fields.push('start_time = ?'); params.push(startTime); }
  if (endTime) { fields.push('end_time = ?'); params.push(endTime); }
  if (status) { fields.push('status = ?'); params.push(status); }

  if (fields.length === 0) throw new Error('No fields to update');

  params.push(meetingId, userId);
  await query(
    `UPDATE meetings SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    params
  );

  const rows = await query('SELECT * FROM meetings WHERE id = ?', [meetingId]);
  return rows[0];
}

module.exports = {
  checkConflicts,
  suggestAlternatives,
  getMeetings,
  getAvailability,
  createMeeting,
  updateMeeting,
};
