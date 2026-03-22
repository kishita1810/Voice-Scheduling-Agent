// pages/api/calendar/create.js
import { createCalendarEvent } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { accessToken, booking } = req.body;

  if (!accessToken || !booking) {
    return res.status(400).json({ error: 'accessToken and booking are required' });
  }

  const { name, date, time, title } = booking;

  // Build start/end DateTimes (1 hour event)
  const startDateTime = new Date(`${date}T${time}:00Z`);
  if (isNaN(startDateTime.getTime())) {
    return res.status(400).json({ error: `Invalid date/time: ${date} ${time}` });
  }
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

  try {
    const event = await createCalendarEvent(accessToken, {
      title: title || 'Meeting',
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      attendeeName: name,
    });

    return res.json({
      success: true,
      eventId: event.id,
      eventLink: event.htmlLink,
      summary: event.summary,
      start: event.start,
    });
  } catch (err) {
    console.error('Calendar error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
