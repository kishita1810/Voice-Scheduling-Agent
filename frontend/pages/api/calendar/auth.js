// pages/api/calendar/auth.js
import { getOAuth2Client, getAuthUrl } from '../../../lib/googleCalendar';

export default function handler(req, res) {
  const oauth2Client = getOAuth2Client();
  const url = getAuthUrl(oauth2Client);
  res.redirect(url);
}
