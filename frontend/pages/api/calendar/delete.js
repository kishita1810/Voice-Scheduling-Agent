import { google } from 'googleapis';
import { getOAuth2Client } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { accessToken, googleEventId } = req.body;

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}