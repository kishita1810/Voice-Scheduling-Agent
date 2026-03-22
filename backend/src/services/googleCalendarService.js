// backend/src/services/googleCalendarService.js
const { google } = require('googleapis');
const logger = require('../utils/logger');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function createCalendarEvent(accessToken, { title, startDateTime, endDateTime, timezone, description }) {
  const auth = getOAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary: title || 'Meeting',
    description: description || 'Scheduled via ARIA Voice Assistant',
    start: { dateTime: startDateTime, timeZone: timezone || 'America/New_York' },
    end: { dateTime: endDateTime, timeZone: timezone || 'America/New_York' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const response = await calendar.events.insert({ calendarId: 'primary', resource: event });
  logger.info('Google Calendar event created', { eventId: response.data.id });
  return response.data;
}

async function updateCalendarEvent(accessToken, googleEventId, updates) {
  const auth = getOAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    resource: updates,
  });

  logger.info('Google Calendar event updated', { eventId: googleEventId });
  return response.data;
}

async function deleteCalendarEvent(accessToken, googleEventId) {
  const auth = getOAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
  logger.info('Google Calendar event deleted', { eventId: googleEventId });
}

module.exports = { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getOAuth2Client };
