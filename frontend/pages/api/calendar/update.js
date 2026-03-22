import { google } from 'googleapis';
import { getOAuth2Client } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { accessToken, googleEventId, newStartTime, newEndTime } = req.body;

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: googleEventId,
      resource: {
        start: { dateTime: newStartTime, timeZone: 'America/New_York' },
        end: { dateTime: newEndTime, timeZone: 'America/New_York' },
      },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}