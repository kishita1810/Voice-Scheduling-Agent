import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

const GREETING = "Hi, I'm ARIA — Vikara's scheduling assistant. Please say your first name clearly.";

function formatBookingDisplay(booking) {
  try {
    const d = new Date(booking.date + 'T00:00:00Z');
    const displayDate = isNaN(d) ? booking.date : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const [h, m] = booking.time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return { name: booking.name, title: booking.title || 'Meeting', date: displayDate, time: `${displayHour}:${m} ${ampm}` };
  } catch {
    return { name: booking.name, title: booking.title || 'Meeting', date: booking.date, time: booking.time };
  }
}

export default function Home() {
  const [phase, setPhase] = useState('idle');
  const [agentState, setAgentState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [booking, setBooking] = useState(null);
  const [calendarEvent, setCalendarEvent] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [log, setLog] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [pendingSpeech, setPendingSpeech] = useState(null);
  const [lastAriaMsg, setLastAriaMsg] = useState('');

  const phaseRef = useRef('idle');
  const agentStateRef = useRef(null);
  const accessTokenRef = useRef(null);
  const transcriptRef = useRef('');
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const isListeningRef = useRef(false);
  const pendingBookingRef = useRef(null);

  const isActive = !['idle', 'error'].includes(phase);

  useEffect(() => {
    const saved = localStorage.getItem('gToken');
    if (saved) { setAccessToken(saved); accessTokenRef.current = saved; }
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const authStatus = params.get('auth');
    if (token) {
      setAccessToken(token); accessTokenRef.current = token;
      localStorage.setItem('gToken', token);
      window.history.replaceState({}, '', '/');
    }
    if (authStatus === 'error') {
      setErrorMsg('Google OAuth failed. Please try again.');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ' ' }) })
      .then(r => { if (r.ok) setUseElevenLabs(true); }).catch(() => {});
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      isListeningRef.current = false;
      try { recognitionRef.current.stop(); } catch (e) {}
    }
  }, []);

  const speak = useCallback(async (text, onEnd) => {
    setPhase('speaking'); phaseRef.current = 'speaking';
    setLastAriaMsg(text);
    stopListening();
    if (useElevenLabs) {
      try {
        const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { onEnd && onEnd(); };
          audio.play(); return;
        }
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95; utter.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google UK English Female') || v.name.includes('Karen'));
      if (preferred) utter.voice = preferred;
      utter.onend = () => { onEnd && onEnd(); };
      window.speechSynthesis.speak(utter);
    } else { onEnd && onEnd(); }
  }, [useElevenLabs, stopListening]);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setErrorMsg('Speech recognition not supported. Use Chrome.'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = true;
    recognition.lang = 'en-US'; recognition.maxAlternatives = 3;
    recognitionRef.current = recognition;
    recognition.onstart = () => { isListeningRef.current = true; setPhase('listening'); phaseRef.current = 'listening'; setInterimText(''); };
    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInterimText(interim);
      if (final) transcriptRef.current = final;
    };
    recognition.onerror = (e) => {
      isListeningRef.current = false;
      if (e.error === 'aborted' || e.error === 'no-speech') {
        setTimeout(() => { if (phaseRef.current === 'listening') startListening(); }, 300); return;
      }
      setErrorMsg(`Mic error: ${e.error}`); setPhase('error'); phaseRef.current = 'error';
    };
    recognition.onend = () => {
      isListeningRef.current = false; setInterimText('');
      const captured = transcriptRef.current.trim();
      transcriptRef.current = '';
      if (captured) { setPendingSpeech(captured); }
      else { setTimeout(() => { if (phaseRef.current === 'listening') startListening(); }, 300); }
    };
    recognition.start();
  }, []);

  useEffect(() => {
    if (!pendingSpeech) return;
    setPendingSpeech(null);
    const text = pendingSpeech;
    setTimeout(() => handleUserSpeech(text), 50);
  }, [pendingSpeech]);

  const handleUserSpeech = useCallback(async (text) => {
    setPhase('thinking'); phaseRef.current = 'thinking';
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLog(l => [...l, `You: ${text}`]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, state: agentStateRef.current }),
      });
      const data = await res.json();
      if (data.state) { setAgentState(data.state); agentStateRef.current = data.state; }
      if (data.error) throw new Error(data.error);
      const assistantMsg = { role: 'assistant', content: data.text };
      setMessages(prev => [...prev, assistantMsg]);
      setLog(l => [...l, `ARIA: ${data.text}`]);
      if (data.booking) {
        pendingBookingRef.current = data.booking; setBooking(data.booking);
        const display = formatBookingDisplay(data.booking);
        const confirmText = `Great! Your ${display.title} is set for ${display.date} at ${display.time} Eastern. Creating your calendar event now!`;
        speak(confirmText, () => createEvent(data.booking));
      } else {
        speak(data.text, () => startListening());
      }
    } catch (err) {
      console.error(err); setErrorMsg(`Something went wrong: ${err.message}`);
      setPhase('error'); phaseRef.current = 'error';
    }
  }, [messages, speak, startListening]);

  const createEvent = useCallback(async (bookingData) => {
    setPhase('thinking'); phaseRef.current = 'thinking';
    const bk = bookingData || pendingBookingRef.current;
    if (!bk) return;
    const token = accessToken || accessTokenRef.current;
    if (!token) {
      setPhase('done'); phaseRef.current = 'done';
      speak("Please connect Google Calendar to save the event.", () => {}); return;
    }
    try {
      const res = await fetch('/api/calendar/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, booking: bk }),
      });
      const data = await res.json();
      if (data.success) {
        setCalendarEvent(data); setPhase('done'); phaseRef.current = 'done';
        setLog(l => [...l, `Event created: ${data.eventLink}`]);
        const newMeeting = {
          id: Date.now().toString(),
          title: bk.title || 'Meeting',
          start_time: `${bk.date}T${bk.time}:00`,
          end_time: `${bk.date}T${String(parseInt(bk.time.split(':')[0])+1).padStart(2,'0')}:${bk.time.split(':')[1]}:00`,
          status: 'scheduled',
          google_event_link: data.eventLink,
          google_event_id: data.eventId,
        };
        const existing = JSON.parse(localStorage.getItem('ariaMeetings') || '[]');
        localStorage.setItem('ariaMeetings', JSON.stringify([...existing, newMeeting]));
        speak(`Done! Your event is confirmed on Google Calendar. See you soon, ${bk.name}!`, () => {});
      } else { throw new Error(data.error); }
    } catch (err) {
      console.error(err); setPhase('done'); phaseRef.current = 'done';
      setLog(l => [...l, `Calendar error: ${err.message}`]);
      speak(`Meeting confirmed, but couldn't sync to Google Calendar.`, () => {});
    }
  }, [accessToken, speak]);

  const startAgent = useCallback(() => {
    setMessages([]); setLog([]); setBooking(null); setCalendarEvent(null);
    setAgentState(null); agentStateRef.current = null;
    setErrorMsg(''); setPendingSpeech(null); setLastAriaMsg('');
    setPhase('connecting'); phaseRef.current = 'connecting';
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    setTimeout(() => {
      const firstMsg = { role: 'assistant', content: GREETING };
      setMessages([firstMsg]); setLog([`ARIA: ${GREETING}`]);
      speak(GREETING, () => startListening());
    }, 300);
  }, [speak, startListening]);

  const reset = useCallback(() => {
    stopListening();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPhase('idle'); phaseRef.current = 'idle';
    setMessages([]); setLog([]); setBooking(null); setCalendarEvent(null);
    setAgentState(null); agentStateRef.current = null;
    setErrorMsg(''); setInterimText(''); transcriptRef.current = '';
    setPendingSpeech(null); setLastAriaMsg('');
  }, [stopListening]);

  const displayBooking = booking ? formatBookingDisplay(booking) : null;

  return (
    <>
      <Head>
        <title>ARIA — Vikara AI Scheduling Agent</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #08090d;
          --surface: #0f1117;
          --surface2: #14161e;
          --border: rgba(255,255,255,0.07);
          --border2: rgba(255,255,255,0.13);
          --accent: #e8f04a;
          --accent-dim: rgba(232,240,74,0.12);
          --accent-border: rgba(232,240,74,0.3);
          --blue: #4a9ef0;
          --text: #f0f2f5;
          --text2: #8892a0;
          --text3: #4a5260;
          --success: #4ade80;
          --danger: #f87171;
        }
        html, body {
          background: var(--bg); color: var(--text);
          font-family: 'Inter', sans-serif;
          min-height: 100vh; overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }
        @keyframes pulseOp { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes orbListening { 0%{box-shadow:0 0 0 0 rgba(232,240,74,0.35)}70%{box-shadow:0 0 0 28px rgba(232,240,74,0)}100%{box-shadow:0 0 0 0 rgba(232,240,74,0)} }
        @keyframes orbSpeaking { from{box-shadow:0 0 15px rgba(74,158,240,0.2)}to{box-shadow:0 0 50px rgba(74,158,240,0.45)} }
        @keyframes ringPulse { 0%{transform:scale(1);opacity:0.4}100%{transform:scale(1.7);opacity:0} }
        @keyframes waveY { 0%,100%{transform:scaleY(0.25)}50%{transform:scaleY(1)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          position: relative; overflow: hidden;
        }
        .page::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none; z-index: 0;
        }
        .glow-1 {
          position: fixed; width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,240,74,0.05) 0%, transparent 70%);
          top: -200px; right: -100px; pointer-events: none; z-index: 0;
        }
        .glow-2 {
          position: fixed; width: 500px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(74,158,240,0.05) 0%, transparent 70%);
          bottom: -150px; left: -100px; pointer-events: none; z-index: 0;
        }

        /* Nav */
        .nav {
          position: relative; z-index: 10;
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.5rem 2.5rem;
          border-bottom: 1px solid var(--border);
          background: rgba(8,9,13,0.8);
          backdrop-filter: blur(12px);
        }
        .nav-brand { display: flex; align-items: center; gap: 0.75rem; }
        .nav-logo {
          font-family: 'Syne', sans-serif;
          font-size: 1.15rem; font-weight: 800;
          letter-spacing: 0.12em; text-transform: uppercase; color: var(--text);
        }
        .nav-divider { width: 1px; height: 18px; background: var(--border2); }
        .nav-product {
          font-size: 0.72rem; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3);
        }
        .nav-right { display: flex; align-items: center; gap: 1rem; }
        .nav-link {
          font-size: 0.72rem; font-weight: 500;
          color: var(--text3); text-decoration: none;
          letter-spacing: 0.05em; text-transform: uppercase;
          padding: 0.4rem 0.9rem; border-radius: 6px;
          border: 1px solid var(--border); transition: all 0.2s; cursor: pointer;
          background: transparent;
        }
        .nav-link:hover { color: var(--text); border-color: var(--border2); }
        .cal-status { font-size: 0.68rem; font-weight: 500; display: flex; align-items: center; gap: 0.4rem; }
        .cal-dot { width: 6px; height: 6px; border-radius: 50%; }

        /* Main */
        .main {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 3rem 1.5rem; gap: 2rem;
        }
        .content {
          width: 100%; max-width: 520px;
          display: flex; flex-direction: column; gap: 1.75rem;
        }

        /* Hero */
        .hero { text-align: center; }
        .hero-eyebrow {
          font-size: 0.68rem; font-weight: 600;
          letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--accent); margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        }
        .hero-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
        .hero-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(4rem, 12vw, 6rem);
          font-weight: 800; letter-spacing: -0.02em;
          color: var(--text); line-height: 0.95; margin-bottom: 1rem;
        }
        .hero-sub {
          font-size: 0.82rem; font-weight: 400;
          color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase;
        }

        /* ARIA bubble */
        .aria-bubble {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px; padding: 1.2rem 1.4rem;
          position: relative; animation: slideUp 0.25s ease;
        }
        .aria-bubble::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1.5px;
          background: linear-gradient(90deg, var(--accent), var(--blue));
          border-radius: 14px 14px 0 0;
        }
        .aria-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }
        .aria-badge {
          font-size: 0.6rem; font-weight: 600;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--accent); padding: 0.15rem 0.5rem;
          background: var(--accent-dim); border: 1px solid var(--accent-border);
          border-radius: 4px;
        }
        .aria-msg { font-size: 0.95rem; font-weight: 400; line-height: 1.65; color: var(--text); }

        /* Orb */
        .orb-zone { display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
        .orb-wrap {
          position: relative; width: 170px; height: 170px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .ring-outer { position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 1px solid rgba(255,255,255,0.05); }
        .ring-mid { position: absolute; width: 75%; height: 75%; border-radius: 50%; border: 1px solid rgba(255,255,255,0.04); }
        .ring-pulse { position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 1px solid rgba(232,240,74,0.35); animation: ringPulse 2.2s ease-out infinite; }
        .ring-pulse-2 { position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 1px solid rgba(232,240,74,0.2); animation: ringPulse 2.2s ease-out infinite; animation-delay: 0.7s; }
        .orb {
          width: 95px; height: 95px; border-radius: 50%;
          background: var(--surface2);
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 2; transition: all 0.25s;
        }
        .orb.idle { border: 1px solid rgba(255,255,255,0.1); }
        .orb.idle:hover { border-color: rgba(232,240,74,0.4); box-shadow: 0 0 30px rgba(232,240,74,0.1); transform: scale(1.03); }
        .orb.listening { border: 1.5px solid var(--accent); animation: orbListening 2s ease-out infinite; }
        .orb.speaking { border: 1.5px solid var(--blue); animation: orbSpeaking 1.3s ease-in-out infinite alternate; }
        .orb.thinking { border: 1px solid rgba(255,255,255,0.15); }
        .orb.connecting { border: 1px solid rgba(255,255,255,0.1); }
        .orb.done { border: 1.5px solid var(--success); box-shadow: 0 0 30px rgba(74,222,128,0.15); }
        .orb-inner { width: 16px; height: 16px; border-radius: 50%; transition: all 0.3s; }
        .orb-inner.idle { background: rgba(255,255,255,0.15); }
        .orb-inner.listening { background: var(--accent); box-shadow: 0 0 14px var(--accent); }
        .orb-inner.speaking { background: var(--blue); box-shadow: 0 0 14px var(--blue); }
        .orb-inner.thinking { background: transparent; border: 2px solid rgba(255,255,255,0.3); animation: pulseOp 0.8s infinite; }
        .orb-inner.done { background: var(--success); box-shadow: 0 0 14px var(--success); }
        .orb-inner.connecting { background: rgba(255,255,255,0.2); animation: pulseOp 1s infinite; }

        /* Wave */
        .wave { display: flex; align-items: center; gap: 4px; height: 32px; }
        .wave-b { width: 3px; border-radius: 3px; transform-origin: center; }

        /* Status */
        .status-row {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.68rem; font-weight: 500;
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        .st-dot { width: 5px; height: 5px; border-radius: 50%; }
        .st-dot.idle { background: var(--text3); }
        .st-dot.listening { background: var(--accent); animation: pulseOp 1s infinite; }
        .st-dot.speaking { background: var(--blue); animation: pulseOp 1.2s infinite; }
        .st-dot.thinking { background: rgba(255,255,255,0.4); animation: pulseOp 0.8s infinite; }
        .st-dot.done { background: var(--success); }
        .st-dot.connecting { background: var(--text3); animation: pulseOp 1s infinite; }
        .st-dot.error { background: var(--danger); }

        /* Transcript */
        .transcript {
          background: var(--surface); border: 1px solid var(--border);
          border-left: 2px solid var(--accent);
          border-radius: 10px; padding: 0.9rem 1.1rem;
          animation: slideUp 0.2s ease;
        }
        .transcript-lbl {
          font-size: 0.58rem; font-weight: 600;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--text3); margin-bottom: 0.35rem;
        }
        .transcript-val { font-size: 0.85rem; color: var(--text2); font-style: italic; line-height: 1.5; }

        /* Booking card */
        .bk-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; padding: 1.5rem 1.75rem;
          position: relative; overflow: hidden; animation: slideUp 0.4s ease;
        }
        .bk-bar {
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, var(--accent), var(--blue));
        }
        .bk-label {
          font-size: 0.6rem; font-weight: 600;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--text3); margin-bottom: 1.1rem;
        }
        .bk-row {
          display: flex; justify-content: space-between;
          align-items: baseline; padding: 0.55rem 0;
          border-bottom: 1px solid var(--border); gap: 1rem;
        }
        .bk-row:last-child { border-bottom: none; }
        .bk-k { font-size: 0.72rem; color: var(--text3); flex-shrink: 0; }
        .bk-v { font-size: 0.95rem; font-weight: 600; text-align: right; color: var(--text); }

        /* Banners */
        .success-banner {
          background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.2);
          border-radius: 10px; padding: 0.9rem 1.1rem;
          font-size: 0.75rem; color: var(--success);
          display: flex; align-items: center; gap: 0.6rem;
          animation: slideUp 0.3s ease;
        }
        .err-banner {
          background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.2);
          border-radius: 10px; padding: 0.9rem 1.1rem;
          font-size: 0.75rem; color: var(--danger);
        }

        /* Buttons */
        .cta-row { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
        .btn-primary {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: 0.82rem; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 0.9rem 2.8rem; border-radius: 8px; cursor: pointer;
          background: var(--accent); border: none; color: #08090d; transition: all 0.2s;
        }
        .btn-primary:hover { background: #f0f85a; transform: translateY(-1px); }
        .btn-primary:active { transform: scale(0.98); }
        .btn-ghost {
          font-size: 0.75rem; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;
          background: transparent; border: 1px solid var(--border2); color: var(--text2);
          transition: all 0.2s;
        }
        .btn-ghost:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }

        .div { height: 1px; background: var(--border); }

        /* Footer */
        .foot {
          position: relative; z-index: 10;
          padding: 1.25rem 2.5rem;
          border-top: 1px solid var(--border);
          background: rgba(8,9,13,0.8);
          backdrop-filter: blur(12px);
          display: flex; justify-content: space-between; align-items: center;
        }
        .foot-brand {
          font-family: 'Syne', sans-serif;
          font-size: 0.68rem; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase; color: var(--text3);
        }
        .foot-right { display: flex; align-items: center; gap: 1rem; }
        .foot-link {
          font-size: 0.65rem; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text3); text-decoration: none; transition: color 0.2s;
          background: none; border: none; cursor: pointer;
        }
        .foot-link:hover { color: var(--text); }
        .foot-status { font-size: 0.65rem; font-weight: 500; display: flex; align-items: center; gap: 0.35rem; }

        /* Log */
        .log-wrap { width: 100%; }
        .log-btn {
          font-size: 0.62rem; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text3); cursor: pointer;
          background: none; border: none; padding: 0; transition: color 0.2s;
        }
        .log-btn:hover { color: var(--text2); }
        .log-list {
          margin-top: 0.75rem; display: flex; flex-direction: column;
          gap: 0.3rem; max-height: 150px; overflow-y: auto;
        }
        .log-e {
          font-size: 0.68rem; color: var(--text3); line-height: 1.5;
          padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .log-e:last-child { border-bottom: none; color: var(--text2); }
      `}</style>

      <div className="page">
        <div className="glow-1" />
        <div className="glow-2" />

        {/* Nav */}
        <nav className="nav">
          <div className="nav-brand">
            <span className="nav-logo">Vikara</span>
            <div className="nav-divider" />
            <span className="nav-product">Scheduling Agent</span>
          </div>
          <div className="nav-right">
            {(accessToken || accessTokenRef.current) ? (
              <div className="cal-status">
                <div className="cal-dot" style={{background:'var(--success)'}} />
                <span style={{color:'var(--success)'}}>Calendar connected</span>
              </div>
            ) : (
              <button className="nav-link" onClick={() => window.location.href = '/api/calendar/auth'}>
                Connect Calendar
              </button>
            )}
            <a href="/meetings" className="nav-link" style={{
              borderColor: 'rgba(232,240,74,0.3)',
              color: 'var(--accent)',
            }}>My Meetings</a>
          </div>
        </nav>

        {/* Main */}
        <main className="main">
          <div className="content">

            {/* Hero */}
            <div className="hero">
              <div className="hero-eyebrow">
                <div className="hero-eyebrow-dot" />
                AI Scheduling Agent
              </div>
              <h1 className="hero-title">ARIA</h1>
              <p className="hero-sub">by Vikara</p>
            </div>

            {/* ARIA bubble */}
            {lastAriaMsg && isActive && (
              <div className="aria-bubble">
                <div className="aria-header">
                  <span className="aria-badge">ARIA</span>
                </div>
                <p className="aria-msg">{lastAriaMsg}</p>
              </div>
            )}

            {/* Orb */}
            <div className="orb-zone">
              <div className="orb-wrap" onClick={phase === 'idle' ? startAgent : undefined}>
                {phase === 'listening' && <>
                  <div className="ring-pulse" />
                  <div className="ring-pulse-2" />
                </>}
                <div className="ring-outer" />
                <div className="ring-mid" />
                <div className={`orb ${phase}`}>
                  <div className={`orb-inner ${phase}`} />
                </div>
              </div>

              {['listening','speaking'].includes(phase) && (
                <div className="wave">
                  {[5,12,20,28,16,24,10,22,18,8,26,14].map((h, i) => (
                    <div key={i} className="wave-b" style={{
                      height: `${h}px`,
                      background: phase === 'speaking' ? 'var(--blue)' : 'var(--accent)',
                      animation: `waveY ${0.55 + i * 0.07}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.055}s`,
                      opacity: 0.6 + (i % 3) * 0.13,
                    }} />
                  ))}
                </div>
              )}

              <div className="status-row">
                <div className={`st-dot ${phase}`} />
                <span style={{color: phase === 'idle' ? 'var(--text3)' : phase === 'listening' ? 'var(--accent)' : phase === 'speaking' ? 'var(--blue)' : phase === 'done' ? 'var(--success)' : 'var(--text2)'}}>
                  {phase === 'idle' && 'Ready to schedule'}
                  {phase === 'connecting' && 'Starting...'}
                  {phase === 'listening' && 'Listening'}
                  {phase === 'thinking' && 'Processing'}
                  {phase === 'speaking' && 'Speaking'}
                  {phase === 'done' && 'Complete'}
                  {phase === 'error' && 'Error'}
                </span>
              </div>
            </div>

            {/* Transcript */}
            {(phase === 'listening' || interimText) && (
              <div className="transcript">
                <div className="transcript-lbl">You</div>
                <p className="transcript-val">{interimText || 'Listening…'}</p>
              </div>
            )}

            {/* Booking card */}
            {displayBooking && (
              <div className="bk-card">
                <div className="bk-bar" />
                <div className="bk-label">Booking confirmed</div>
                <div className="bk-row"><span className="bk-k">Name</span><span className="bk-v">{displayBooking.name}</span></div>
                <div className="bk-row"><span className="bk-k">Event</span><span className="bk-v">{displayBooking.title}</span></div>
                <div className="bk-row"><span className="bk-k">Date</span><span className="bk-v">{displayBooking.date}</span></div>
                <div className="bk-row"><span className="bk-k">Time</span><span className="bk-v">{displayBooking.time} Eastern</span></div>
              </div>
            )}

            {/* Success */}
            {calendarEvent && (
              <div className="success-banner">
                <span>✓</span>
                <span>Event added to Google Calendar.{' '}
                  <a href={calendarEvent.eventLink} target="_blank" rel="noopener noreferrer" style={{color:'var(--success)',textDecoration:'underline'}}>Open event</a>
                </span>
              </div>
            )}

            {/* Error */}
            {errorMsg && <div className="err-banner">⚠ {errorMsg}</div>}

            {/* CTA */}
            <div className="cta-row">
              {phase === 'idle' && (
                <button className="btn-primary" onClick={startAgent}>Start Session</button>
              )}
              {phase !== 'idle' && (
                <button className="btn-ghost" onClick={reset}>Reset</button>
              )}
              {phase === 'done' && !calendarEvent && (accessToken || accessTokenRef.current) && booking && (
                <button className="btn-primary" onClick={() => createEvent(booking)}>Retry</button>
              )}
            </div>

            <div className="div" />

            {log.length > 0 && <ConvoLog entries={log} />}
          </div>
        </main>

        {/* Footer */}
        <footer className="foot">
          <span className="foot-brand">Vikara © 2026</span>
          <div className="foot-right">
            <a href="https://vikara.ai" target="_blank" rel="noopener noreferrer" className="foot-link">vikara.ai</a>
            <a href="/meetings" className="foot-link" style={{
              color: 'var(--accent)',
              borderBottom: '1px solid rgba(232,240,74,0.3)',
              paddingBottom: '1px',
            }}>My Meetings →</a>
            {(accessToken || accessTokenRef.current) ? (
              <div className="foot-status">
                <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--success)'}} />
                <span style={{color:'var(--success)'}}>Calendar synced</span>
              </div>
            ) : (
              <button className="foot-link" onClick={() => window.location.href = '/api/calendar/auth'}>
                Connect Calendar
              </button>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}

function ConvoLog({ entries }) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, open]);
  return (
    <div className="log-wrap">
      <button className="log-btn" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Session log ({entries.length})
      </button>
      {open && (
        <div className="log-list" ref={scrollRef}>
          {entries.map((e, i) => <div key={i} className="log-e">{e}</div>)}
        </div>
      )}
    </div>
  );
}