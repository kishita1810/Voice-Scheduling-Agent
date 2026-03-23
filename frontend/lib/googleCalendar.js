// lib/googleCalendar.js
import { google } from 'googleapis';

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/calendar/callback`
  );
}

export function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
  });
}

export async function createCalendarEvent(accessToken, eventDetails) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const { title, startDateTime, endDateTime, attendeeName } = eventDetails;

  const event = {
    summary: title || 'Meeting',
    description: `Scheduled via Voice Scheduler with ${attendeeName}`,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/New_York',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return response.data;
}
