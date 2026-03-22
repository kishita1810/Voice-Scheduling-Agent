import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setLoading(false);
    const saved = localStorage.getItem('ariaMeetings');
    if (saved) {
      try { setMeetings(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  async function handleCancel(meetingId) {
    const token = localStorage.getItem('gToken');
    const meeting = meetings.find(m => m.id === meetingId);
    if (token && meeting?.google_event_id) {
      try {
        await fetch('/api/calendar/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token, googleEventId: meeting.google_event_id }),
        });
      } catch (e) {}
    }
    const updated = meetings.map(m => m.id === meetingId ? { ...m, status: 'cancelled' } : m);
    setMeetings(updated);
    localStorage.setItem('ariaMeetings', JSON.stringify(updated));
    setConfirmCancel(null);
    flash('Meeting cancelled');
  }

  async function handleReschedule(meetingId) {
    const { newDate, newTime } = editForm;
    if (!newDate || !newTime) return;

    // Business hours validation
    const hour = parseInt(newTime.split(':')[0]);
    if (hour < 9 || hour >= 17) {
      setError('Meetings must be scheduled between 9 AM and 5 PM.');
      return;
    }
    const dayOfWeek = new Date(newDate + 'T00:00:00Z').getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      setError('Meetings can only be scheduled on weekdays.');
      return;
    }

    const token = localStorage.getItem('gToken');
    const meeting = meetings.find(m => m.id === meetingId);
    const newStartTime = `${newDate}T${newTime}:00`;
    const newEndTime = `${newDate}T${String(parseInt(newTime.split(':')[0])+1).padStart(2,'0')}:${newTime.split(':')[1]}:00`;

    if (token && meeting?.google_event_id) {
      try {
        await fetch('/api/calendar/update', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token, googleEventId: meeting.google_event_id, newStartTime, newEndTime }),
        });
      } catch (e) {}
    }

    const updated = meetings.map(m => m.id === meetingId
      ? { ...m, start_time: newStartTime, end_time: newEndTime, status: 'rescheduled' }
      : m
    );
    setMeetings(updated);
    localStorage.setItem('ariaMeetings', JSON.stringify(updated));
    setEditingId(null);
    setEditForm({});
    setError('');
    flash('Meeting rescheduled');
  }

  function formatDay(dt) {
    return new Date(dt).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  }
  function formatDate(dt) {
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  }
  function formatTime(dt) {
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  }
  function getMonthDay(dt) {
    const d = new Date(dt);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' }).toUpperCase(),
      day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/New_York' }),
    };
  }

  const active = meetings.filter(m => m.status !== 'cancelled');
  const cancelled = meetings.filter(m => m.status === 'cancelled');

  return (
    <>
      <Head>
        <title>My Meetings — Vikara ARIA</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #08090d; --surface: #0f1117; --surface2: #14161e;
          --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.13);
          --accent: #e8f04a; --accent-dim: rgba(232,240,74,0.1); --accent-border: rgba(232,240,74,0.25);
          --blue: #4a9ef0; --blue-dim: rgba(74,158,240,0.1); --blue-border: rgba(74,158,240,0.25);
          --text: #f0f2f5; --text2: #8892a0; --text3: #4a5260;
          --success: #4ade80; --danger: #f87171; --warning: #fbbf24;
        }
        html, body {
          background: var(--bg); color: var(--text);
          font-family: 'Inter', sans-serif; min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0}to{opacity:1} }
        @keyframes toastIn { from{opacity:0;transform:translateY(20px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: grid; grid-template-rows: auto 1fr auto;
          position: relative; overflow-x: hidden;
        }
        .page::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none; z-index: 0;
        }
        .glow-1 {
          position: fixed; width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(232,240,74,0.04) 0%, transparent 70%);
          top: -150px; right: -100px; pointer-events: none; z-index: 0;
        }

        /* Nav */
        .nav {
          position: relative; z-index: 10;
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.5rem 2.5rem;
          border-bottom: 1px solid var(--border);
          background: rgba(8,9,13,0.85); backdrop-filter: blur(12px);
        }
        .nav-brand { display: flex; align-items: center; gap: 0.75rem; }
        .nav-logo {
          font-family: 'Syne', sans-serif; font-size: 1.1rem;
          font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
        }
        .nav-div { width: 1px; height: 18px; background: var(--border2); }
        .nav-page { font-size: 0.72rem; font-weight: 500; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; }
        .nav-back {
          font-size: 0.72rem; font-weight: 500; color: var(--text3);
          text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase;
          padding: 0.4rem 0.9rem; border-radius: 6px;
          border: 1px solid var(--border); transition: all 0.2s;
        }
        .nav-back:hover { color: var(--text); border-color: var(--border2); }

        /* Main */
        .main {
          position: relative; z-index: 1;
          max-width: 780px; margin: 0 auto; width: 100%;
          padding: 3rem 1.5rem;
        }

        /* Header */
        .page-header {
          display: flex; justify-content: space-between;
          align-items: flex-end; margin-bottom: 2.5rem;
          animation: slideUp 0.3s ease;
        }
        .page-title {
          font-family: 'Syne', sans-serif;
          font-size: 2.5rem; font-weight: 800;
          letter-spacing: -0.02em; line-height: 1;
        }
        .page-count {
          font-size: 0.72rem; font-weight: 500;
          color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase;
          background: var(--surface); border: 1px solid var(--border);
          padding: 0.4rem 0.9rem; border-radius: 6px;
        }

        /* Stats row */
        .stats {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1rem; margin-bottom: 2.5rem;
          animation: slideUp 0.35s ease;
        }
        .stat {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 1.1rem 1.25rem;
        }
        .stat-num {
          font-family: 'Syne', sans-serif;
          font-size: 1.8rem; font-weight: 800; line-height: 1;
          margin-bottom: 0.35rem;
        }
        .stat-label {
          font-size: 0.65rem; font-weight: 500;
          color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase;
        }

        /* Section label */
        .section-label {
          font-size: 0.62rem; font-weight: 600;
          color: var(--text3); letter-spacing: 0.2em; text-transform: uppercase;
          margin-bottom: 1rem; display: flex; align-items: center; gap: 0.6rem;
        }
        .section-label::after {
          content: ''; flex: 1; height: 1px; background: var(--border);
        }

        /* Meeting card */
        .card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; margin-bottom: 1rem;
          overflow: hidden; transition: border-color 0.2s;
          animation: slideUp 0.4s ease;
        }
        .card:hover { border-color: rgba(255,255,255,0.12); }
        .card.rescheduled { border-color: rgba(251,191,36,0.2); }
        .card.cancelled { border-color: rgba(248,113,113,0.12); opacity: 0.55; }
        .card-inner { display: flex; align-items: stretch; }

        /* Date block */
        .date-block {
          width: 76px; flex-shrink: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 1.25rem 0.5rem;
          border-right: 1px solid var(--border);
          gap: 0.1rem;
        }
        .date-month {
          font-size: 0.58rem; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase;
        }
        .date-day {
          font-family: 'Syne', sans-serif;
          font-size: 2rem; font-weight: 800; line-height: 1;
        }
        .date-dow {
          font-size: 0.6rem; font-weight: 500;
          color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase;
        }

        /* Card body */
        .card-body {
          flex: 1; padding: 1.25rem 1.5rem;
          display: flex; flex-direction: column; gap: 0.6rem;
        }
        .card-top {
          display: flex; justify-content: space-between;
          align-items: flex-start; gap: 1rem;
        }
        .card-title {
          font-size: 1rem; font-weight: 600; line-height: 1.3;
        }
        .status-pill {
          flex-shrink: 0; font-size: 0.58rem; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase;
          padding: 0.22rem 0.65rem; border-radius: 100px;
        }
        .s-scheduled { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-border); }
        .s-rescheduled { background: rgba(251,191,36,0.1); color: var(--warning); border: 1px solid rgba(251,191,36,0.25); }
        .s-cancelled { background: rgba(248,113,113,0.1); color: var(--danger); border: 1px solid rgba(248,113,113,0.2); }

        .card-meta {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
        }
        .meta-item {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.75rem; color: var(--text2);
        }
        .meta-icon { font-size: 0.7rem; opacity: 0.6; }

        .card-actions {
          display: flex; gap: 0.6rem; margin-top: 0.25rem; flex-wrap: wrap;
        }
        .btn-sm {
          font-size: 0.68rem; font-weight: 500;
          letter-spacing: 0.06em; text-transform: uppercase;
          padding: 0.4rem 0.9rem; border-radius: 6px;
          cursor: pointer; transition: all 0.18s;
        }
        .btn-outline {
          background: transparent; border: 1px solid var(--border2); color: var(--text2);
        }
        .btn-outline:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
        .btn-danger-sm {
          background: transparent; border: 1px solid rgba(248,113,113,0.2); color: var(--danger);
        }
        .btn-danger-sm:hover { background: rgba(248,113,113,0.07); border-color: rgba(248,113,113,0.4); }
        .btn-accent {
          background: var(--accent); border: none; color: #08090d; font-weight: 600;
        }
        .btn-accent:hover { background: #f0f85a; }
        .gcal-link {
          font-size: 0.68rem; color: var(--success); text-decoration: none;
          display: flex; align-items: center; gap: 0.25rem; opacity: 0.8; transition: opacity 0.2s;
        }
        .gcal-link:hover { opacity: 1; }

        /* Edit form */
        .edit-panel {
          padding: 1.1rem 1.5rem; padding-top: 0;
          border-top: 1px solid var(--border);
          display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap;
          background: rgba(255,255,255,0.015);
          animation: fadeIn 0.2s ease;
        }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-label {
          font-size: 0.58rem; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase; color: var(--text3);
        }
        .form-input {
          background: var(--surface2); border: 1px solid var(--border2);
          color: var(--text); padding: 0.5rem 0.75rem; border-radius: 7px;
          font-size: 0.78rem; font-family: 'Inter', sans-serif;
          transition: border-color 0.2s; outline: none;
        }
        .form-input:focus { border-color: var(--accent); }
        .form-note {
          font-size: 0.62rem; color: var(--text3);
          align-self: center; padding-bottom: 2px;
        }

        /* Empty */
        .empty {
          text-align: center; padding: 5rem 2rem;
          border: 1px dashed rgba(255,255,255,0.07); border-radius: 16px;
          animation: fadeIn 0.4s ease;
        }
        .empty-icon { font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.3; }
        .empty-title { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; }
        .empty-sub { font-size: 0.8rem; color: var(--text3); }
        .empty-cta {
          display: inline-block; margin-top: 1.5rem;
          font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
          background: var(--accent); color: #08090d; padding: 0.65rem 1.5rem;
          border-radius: 7px; text-decoration: none; transition: background 0.2s;
        }
        .empty-cta:hover { background: #f0f85a; }

        /* Error */
        .err-banner {
          background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.2);
          border-radius: 10px; padding: 0.75rem 1rem;
          font-size: 0.75rem; color: var(--danger); margin-bottom: 1.25rem;
          display: flex; align-items: center; gap: 0.5rem;
        }

        /* Toast */
        .toast {
          position: fixed; bottom: 2rem; right: 2rem; z-index: 999;
          background: var(--success); color: #08090d;
          font-size: 0.78rem; font-weight: 600; letter-spacing: 0.05em;
          padding: 0.75rem 1.25rem; border-radius: 8px;
          display: flex; align-items: center; gap: 0.5rem;
          animation: toastIn 0.3s ease;
          box-shadow: 0 8px 30px rgba(74,222,128,0.25);
        }

        /* Modal */
        .overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(8,9,13,0.88); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
          animation: fadeIn 0.2s ease;
        }
        .modal {
          background: var(--surface); border: 1px solid var(--border2);
          border-radius: 18px; padding: 2rem; max-width: 420px; width: 100%;
          animation: slideUp 0.25s ease;
        }
        .modal-title { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; }
        .modal-sub { font-size: 0.82rem; color: var(--text2); line-height: 1.5; margin-bottom: 1.75rem; }
        .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

        /* Footer */
        .foot {
          position: relative; z-index: 10;
          padding: 1.25rem 2.5rem;
          border-top: 1px solid var(--border);
          background: rgba(8,9,13,0.85); backdrop-filter: blur(12px);
          display: flex; justify-content: space-between; align-items: center;
        }
        .foot-brand {
          font-family: 'Syne', sans-serif; font-size: 0.68rem;
          font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text3);
        }
        .foot-link {
          font-size: 0.65rem; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--text3); text-decoration: none; transition: color 0.2s;
        }
        .foot-link:hover { color: var(--text); }
      `}</style>

      <div className="page">
        <div className="glow-1" />

        {/* Nav */}
        <nav className="nav">
          <div className="nav-brand">
            <span className="nav-logo">Vikara</span>
            <div className="nav-div" />
            <span className="nav-page">My Meetings</span>
          </div>
          <a href="/" className="nav-back">← Back to ARIA</a>
        </nav>

        {/* Main */}
        <main className="main">

          {/* Header */}
          <div className="page-header">
            <h1 className="page-title">Meetings</h1>
            <div className="page-count">{meetings.length} total</div>
          </div>

          {/* Stats */}
          {meetings.length > 0 && (
            <div className="stats">
              <div className="stat">
                <div className="stat-num" style={{color:'var(--accent)'}}>{active.length}</div>
                <div className="stat-label">Scheduled</div>
              </div>
              <div className="stat">
                <div className="stat-num" style={{color:'var(--warning)'}}>{meetings.filter(m=>m.status==='rescheduled').length}</div>
                <div className="stat-label">Rescheduled</div>
              </div>
              <div className="stat">
                <div className="stat-num" style={{color:'var(--text3)'}}>{cancelled.length}</div>
                <div className="stat-label">Cancelled</div>
              </div>
            </div>
          )}

          {error && (
            <div className="err-banner">
              <span>⚠</span> {error}
            </div>
          )}

          {loading ? (
            <div className="empty">
              <div className="empty-icon">⟳</div>
              <div className="empty-title">Loading...</div>
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📅</div>
              <div className="empty-title">No meetings yet</div>
              <div className="empty-sub">Start a voice session with ARIA to schedule your first meeting.</div>
              <a href="/" className="empty-cta">Open ARIA →</a>
            </div>
          ) : (
            <>
              {/* Active meetings */}
              {active.length > 0 && (
                <>
                  <div className="section-label">Upcoming & Active</div>
                  {active.map(m => {
                    const { month, day } = getMonthDay(m.start_time);
                    return (
                      <div key={m.id} className={`card ${m.status}`}>
                        <div className="card-inner">
                          <div className="date-block">
                            <div className="date-month" style={{color: m.status === 'rescheduled' ? 'var(--warning)' : 'var(--accent)'}}>{month}</div>
                            <div className="date-day">{day}</div>
                            <div className="date-dow">{formatDay(m.start_time)}</div>
                          </div>
                          <div className="card-body">
                            <div className="card-top">
                              <div className="card-title">{m.title}</div>
                              <span className={`status-pill s-${m.status}`}>{m.status}</span>
                            </div>
                            <div className="card-meta">
                              <div className="meta-item">
                                <span className="meta-icon">🕐</span>
                                <span>{formatTime(m.start_time)} — {formatTime(m.end_time)} ET</span>
                              </div>
                              <div className="meta-item">
                                <span className="meta-icon">📆</span>
                                <span>{formatDate(m.start_time)}</span>
                              </div>
                              {m.google_event_link && (
                                <a href={m.google_event_link} target="_blank" rel="noopener noreferrer" className="gcal-link">
                                  Open in Google Calendar ↗
                                </a>
                              )}
                            </div>
                            <div className="card-actions">
                              <button className="btn-sm btn-outline" onClick={() => {
                                setEditingId(editingId === m.id ? null : m.id);
                                setEditForm({}); setError('');
                              }}>
                                {editingId === m.id ? 'Close' : 'Reschedule'}
                              </button>
                              <button className="btn-sm btn-danger-sm" onClick={() => setConfirmCancel(m)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>

                        {editingId === m.id && (
                          <div className="edit-panel">
                            <div className="form-group">
                              <label className="form-label">New Date</label>
                              <input type="date" className="form-input"
                                value={editForm.newDate || ''}
                                onChange={e => setEditForm(f => ({ ...f, newDate: e.target.value }))} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">New Time</label>
                              <input type="time" className="form-input"
                                value={editForm.newTime || ''}
                                min="09:00" max="17:00"
                                onChange={e => setEditForm(f => ({ ...f, newTime: e.target.value }))} />
                            </div>
                            <span className="form-note">Weekdays · 9 AM–5 PM only</span>
                            <button className="btn-sm btn-accent" onClick={() => handleReschedule(m.id)}>
                              Confirm
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Cancelled */}
              {cancelled.length > 0 && (
                <>
                  <div className="section-label" style={{marginTop: active.length > 0 ? '2rem' : 0}}>Cancelled</div>
                  {cancelled.map(m => {
                    const { month, day } = getMonthDay(m.start_time);
                    return (
                      <div key={m.id} className="card cancelled">
                        <div className="card-inner">
                          <div className="date-block">
                            <div className="date-month" style={{color:'var(--text3)'}}>{month}</div>
                            <div className="date-day" style={{color:'var(--text3)'}}>{day}</div>
                            <div className="date-dow">{formatDay(m.start_time)}</div>
                          </div>
                          <div className="card-body">
                            <div className="card-top">
                              <div className="card-title" style={{color:'var(--text2)',textDecoration:'line-through'}}>{m.title}</div>
                              <span className="status-pill s-cancelled">Cancelled</span>
                            </div>
                            <div className="card-meta">
                              <div className="meta-item">
                                <span className="meta-icon">🕐</span>
                                <span>{formatTime(m.start_time)} ET</span>
                              </div>
                              <div className="meta-item">
                                <span className="meta-icon">📆</span>
                                <span>{formatDate(m.start_time)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="foot">
          <span className="foot-brand">Vikara © 2026</span>
          <a href="https://vikara.ai" target="_blank" rel="noopener noreferrer" className="foot-link">vikara.ai</a>
        </footer>
      </div>

      {/* Cancel modal */}
      {confirmCancel && (
        <div className="overlay" onClick={() => setConfirmCancel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Cancel this meeting?</div>
            <div className="modal-sub">
              <strong>{confirmCancel.title}</strong> on {formatDate(confirmCancel.start_time)} at {formatTime(confirmCancel.start_time)} will be removed from your calendar.
            </div>
            <div className="modal-actions">
              <button className="btn-sm btn-outline" onClick={() => setConfirmCancel(null)}>Keep it</button>
              <button className="btn-sm btn-danger-sm" style={{padding:'0.5rem 1.25rem'}} onClick={() => handleCancel(confirmCancel.id)}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {successMsg && (
        <div className="toast">
          <span>✓</span> {successMsg}
        </div>
      )}
    </>
  );
}