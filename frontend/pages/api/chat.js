// frontend/pages/api/chat.js
// Handles voice conversation AND posts to backend API on confirmation
import Groq from 'groq-sdk';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000/api';

async function extract(type, userSpeech) {
  const today = new Date().toISOString().split('T')[0];
  const prompts = {
    name: `Extract a first name from this text. If no name found, return "Friend". Reply with ONLY one word: "${userSpeech}"`,
    date: `Extract the date and return ONLY in YYYY-MM-DD format. Today is ${today}. Examples: "tomorrow" → next day, "March 24" → ${today.split('-')[0]}-03-24, "24" → ${today.split('-')[0]}-${today.split('-')[1]}-24. Text: "${userSpeech}". Reply with ONLY YYYY-MM-DD:`,
    time: `Extract the time and return ONLY in HH:MM 24-hour format. Examples: "9 AM"→"09:00", "2 PM"→"14:00", "noon"→"12:00", "3:30 PM"→"15:30". Text: "${userSpeech}". Reply with ONLY HH:MM:`,
    title: `Extract a short meeting title. If none, reply "Meeting". Text: "${userSpeech}". Reply with ONLY the title:`,
  };

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 20,
    temperature: 0,
    messages: [{ role: 'user', content: prompts[type] }],
  });

  return response.choices[0].message.content.trim();
}

// Retry wrapper for backend calls
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, state } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const collected = state || { name: null, date: null, time: null, title: null, step: 'name' };
  const lastUserMsg = messages[messages.length - 1]?.content || '';

  try {
    let text = '';
    let newState = { ...collected };
    let booking = null;

    if (collected.step === 'name') {
      let name = await extract('name', lastUserMsg);
      const invalid = !name || name.length > 20 ||
        ['friend', 'no name', 'extract', 'there', 'none', 'unknown'].includes(name.toLowerCase());
      if (invalid) {
        text = `Sorry, I didn't catch your name. Please say just your first name clearly.`;
        return res.json({ text, booking: null, state: newState });
      }
      newState.name = name;
      newState.step = 'date';
      text = `Nice to meet you, ${name}! What date works for your meeting?`;

    } else if (collected.step === 'date') {
      const date = await extract('date', lastUserMsg);
      const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        newState.step = 'date';
        text = `Meetings can only be scheduled on weekdays. What date works for you?`;
      } else {
        newState.date = date;
        newState.step = 'time';
        const displayDate = new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
        });
        text = `Got it — ${displayDate}. What time works? Business hours are 9 AM to 5 PM.`;
      }

    } else if (collected.step === 'time') {
      const time = await extract('time', lastUserMsg);
      const validTime = /^\d{2}:\d{2}$/.test(time) && !isNaN(new Date(`2000-01-01T${time}:00Z`).getTime());
      if (!validTime) {
        newState.step = 'time';
        text = `Sorry, I didn't catch that. Please say something like 2 PM or 9 AM.`;
      } else {
        const hour = parseInt(time.split(':')[0]);
        if (hour < 9 || hour >= 17) {
          newState.step = 'time';
          text = `Sorry, meetings can only be scheduled during business hours — 9 AM to 5 PM. What time works for you?`;
        } else {
          newState.time = time;
          newState.step = 'title';
          text = `Got it! What would you like to call this meeting?`;
        }
      }

    } else if (collected.step === 'title') {
      let title = 'Meeting';
      try {
        const extracted = await extract('title', lastUserMsg);
        title = extracted && extracted.length > 0 && !extracted.toLowerCase().includes('no title') ? extracted : 'Meeting';
      } catch (e) { title = 'Meeting'; }
      newState.title = title;
      newState.step = 'confirm';
      const displayDate = new Date(newState.date + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      });
      const [h, m] = newState.time.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      text = `Got it! I have "${title}" for ${newState.name} on ${displayDate} at ${displayHour}:${m} ${ampm} Eastern. Does that sound right?`;

    } else if (collected.step === 'confirm') {
      const msg = lastUserMsg.toLowerCase().trim();
      const yes = /yes|yeah|yep|yup|sure|ok|okay|correct|right|good|great|confirm|sounds|perfect|book|go ahead|absolutely|definitely|do it|that's right|looks good/i.test(msg);
      const no = /\bno\b|nope|wrong|change|different|actually|cancel|stop|restart/i.test(msg);

      if (yes) {
        newState.step = 'done';
        text = `Great! Creating your calendar event now.`;
        booking = {
          status: 'confirmed',
          name: newState.name,
          date: newState.date,
          time: newState.time,
          title: newState.title || 'Meeting',
        };

        // ── Post to backend API (non-blocking) ──────────────────────────
        const accessToken = req.headers['x-access-token'];
        const userId = req.headers['x-user-id'];
        if (accessToken && userId && booking) {
          const startTime = `${booking.date}T${booking.time}:00`;
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          try {
            await fetchWithRetry(`${BACKEND_URL}/meetings/schedule`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                title: booking.title,
                startTime,
                endTime,
                timezone: 'America/New_York',
                accessToken,
              }),
            });
          } catch (backendErr) {
            console.error('Backend sync failed (non-critical):', backendErr.message);
          }
        }

      } else if (no) {
        newState = { name: null, date: null, time: null, title: null, step: 'name' };
        text = `No problem, let's start over. What's your name?`;
      } else {
        text = `I just need a yes or no — shall I book this for ${newState.name}?`;
      }
    }

    return res.json({ text, booking, state: newState });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
