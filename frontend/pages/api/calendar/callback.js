// pages/api/calendar/callback.js
import { getOAuth2Client } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  const oauth2Client = getOAuth2Client();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    // Return token to frontend via query param (simple approach for demo)
    // In production, store in a secure session/cookie
    const accessToken = tokens.access_token;
    res.redirect(`/?auth=success&token=${encodeURIComponent(accessToken)}`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?auth=error');
  }
}
