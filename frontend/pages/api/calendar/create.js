import { createCalendarEvent } from '../../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { accessToken, booking } = req.body;
  if (!accessToken || !booking) {
    return res.status(400).json({ error: 'accessToken and booking are required' });
  }

  const { name, date, time, title } = booking;

  const [h, m] = time.split(':');
  const endHour = String(parseInt(h) + 1).padStart(2, '0');
  const startDateTime = `${date}T${time}:00`;
  const endDateTime = `${date}T${endHour}:${m}:00`;

  try {
    const event = await createCalendarEvent(accessToken, {
      title: title || 'Meeting',
      startDateTime,
      endDateTime,
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