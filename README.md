# ARIA — AI Voice Scheduling Assistant

> A production-grade, full-stack voice agent that books real Google Calendar events through natural conversation.

**Live Demo:** https://your-vercel-url.vercel.app
**Demo Video:** https://loom.com/your-link
**Backend API:** http://your-ec2-ip:4000/api

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│                                                                 │
│  Web Speech API (STT) ──► Voice Agent UI ──► Web Speech (TTS)  │
│                                  │                              │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ HTTPS
                    ┌──────────────┼───────────────┐
                    │         VERCEL CDN            │
                    │      Next.js Frontend         │
                    │                               │
                    │  /api/chat  ──► Groq LLM      │
                    │  /api/tts   ──► ElevenLabs     │
                    │  /api/calendar/* ──► Google   │
                    └──────────────┬────────────────┘
                                   │ HTTP
                    ┌──────────────▼────────────────┐
                    │         AWS EC2               │
                    │      Express.js Backend       │
                    │                               │
                    │  POST /api/meetings/schedule  │
                    │  POST /api/meetings/reschedule│
                    │  POST /api/meetings/cancel    │
                    │  GET  /api/meetings           │
                    │  GET  /api/meetings/availability│
                    │  GET  /api/health             │
                    └──────────────┬────────────────┘
                                   │ mysql2
                    ┌──────────────▼────────────────┐
                    │         AWS RDS               │
                    │         MySQL 8.0             │
                    │                               │
                    │  users                        │
                    │  meetings                     │
                    │  user_preferences             │
                    │  api_logs                     │
                    └───────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 | Server-side rendering, API routes |
| Voice STT | Web Speech API | Browser-native speech recognition |
| Voice TTS | ElevenLabs → Web Speech fallback | Natural voice output |
| LLM | Groq (Llama 3.3 70B) | Conversation + entity extraction |
| Backend | Express.js | REST API server |
| Database | MySQL 8.0 (AWS RDS) | Persistent meeting storage |
| Calendar | Google Calendar API v3 | Real event creation |
| Deployment | Vercel + AWS EC2 + AWS RDS | Production cloud hosting |
| Process Mgmt | PM2 | Backend auto-restart |
| Logging | Winston | Structured logging to files |

---

## Key Features

### Voice Intelligence
- Real-time speech recognition via Web Speech API
- State machine conversation flow — never loses context
- LLM-powered entity extraction (name, date, time, title)
- Natural language date parsing ("next Tuesday", "day after tomorrow")
- Robust confirmation with broad yes/no detection

### Backend REST API
- `POST /api/meetings/schedule` — schedule with conflict detection
- `POST /api/meetings/reschedule` — update with alternative suggestions
- `POST /api/meetings/cancel` — cancel locally + Google Calendar
- `GET /api/meetings` — list with filters (date range, status)
- `GET /api/meetings/availability` — free/busy slots for a day
- `GET /api/health` — uptime + DB connectivity check

### Scheduling Intelligence
- **Conflict detection** — checks overlapping meetings before booking
- **Alternative suggestions** — auto-suggests 3 nearby free slots on conflict
- **Timezone handling** — America/New_York with DST support
- **Availability API** — returns free 30-min+ slots in a workday

### Database Design
- Normalized MySQL schema (users, meetings, preferences, logs)
- Connection pooling (10 connections)
- Automatic retry on transient failures (3 retries with backoff)
- All requests logged to `api_logs` table

### Production Reliability
- Rate limiting (100 req/15 min per IP)
- Helmet security headers
- CORS restricted to frontend domain
- Input validation on all endpoints (express-validator)
- Global error handler with structured responses
- Winston logging to rotating files + console
- PM2 process management with auto-restart

---

## Project Structure

```
voice-scheduler/
├── frontend/                    # Next.js App (Vercel)
│   ├── pages/
│   │   ├── index.js             # Voice agent UI
│   │   ├── meetings.js          # Meeting dashboard (edit/cancel)
│   │   └── api/
│   │       ├── chat.js          # Groq conversation + backend sync
│   │       ├── tts.js           # ElevenLabs TTS proxy
│   │       └── calendar/        # Google OAuth + event creation
│   └── lib/
│       └── googleCalendar.js
│
├── backend/                     # Express.js API (AWS EC2)
│   └── src/
│       ├── server.js            # App entry point
│       ├── routes/
│       │   ├── meetings.js      # Schedule/reschedule/cancel/list
│       │   ├── users.js         # User management
│       │   └── health.js        # Health check
│       ├── services/
│       │   ├── schedulingService.js    # Conflict detection, availability
│       │   └── googleCalendarService.js
│       ├── middleware/
│       │   ├── requestLogger.js
│       │   └── errorHandler.js
│       ├── db/
│       │   ├── connection.js    # MySQL pool + query helper
│       │   └── migrate.js       # Schema migrations
│       └── utils/
│           └── logger.js        # Winston logger
│
├── database/
│   └── schema.sql               # Full MySQL schema
│
└── docs/
    └── AWS_DEPLOYMENT.md        # Step-by-step cloud deployment
```

---

## API Reference

### Schedule a Meeting
```http
POST /api/meetings/schedule
Content-Type: application/json

{
  "userId": "uuid",
  "title": "Team Standup",
  "startTime": "2026-03-25T14:00:00",
  "endTime": "2026-03-25T15:00:00",
  "timezone": "America/New_York",
  "accessToken": "google_oauth_token"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Team Standup",
    "start_time": "2026-03-25T14:00:00",
    "status": "scheduled",
    "google_event_link": "https://calendar.google.com/..."
  }
}
```

**Conflict Response (409):**
```json
{
  "success": false,
  "error": "Time slot conflicts with existing meeting",
  "conflicts": [...],
  "suggestions": [
    { "start": "...", "end": "...", "label": "1h later" },
    { "start": "...", "end": "...", "label": "2h later" }
  ]
}
```

---

### Check Availability
```http
GET /api/meetings/availability?userId=uuid&date=2026-03-25
```

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-03-25",
    "bookedMeetings": [...],
    "freeSlots": [
      { "start": "2026-03-25T08:00:00", "end": "2026-03-25T10:00:00", "durationMinutes": 120 }
    ]
  }
}
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- MySQL 8.0 (or use Docker: `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=pass -e MYSQL_DATABASE=aria_scheduler mysql:8`)
- Chrome/Edge browser

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local   # fill in keys
npm run dev
# → http://localhost:3000
```

### Backend
```bash
cd backend
npm install
cp .env.example .env         # fill in keys
npm run migrate              # create tables
npm run dev
# → http://localhost:4000
```

### Environment Variables

**Frontend (`.env.local`):**
```
GROQ_API_KEY=gsk_...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000/api
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

**Backend (`.env`):**
```
PORT=4000
DB_HOST=localhost
DB_NAME=aria_scheduler
DB_USER=root
DB_PASSWORD=your_password
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FRONTEND_URL=http://localhost:3000
```

---

## Cloud Deployment

See [docs/AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md) for full instructions.

**Summary:**
- Frontend → Vercel (one-click deploy from GitHub)
- Backend → AWS EC2 t2.micro with PM2
- Database → AWS RDS MySQL (free tier)
- Cost → ~$0/month on AWS free tier

---

## Screenshots

![ARIA Voice Agent](screenshots/01-listening.png)
![Booking Confirmed](screenshots/02-confirmed.png)
![Calendar Event Created](screenshots/03-success.png)
![Meetings Dashboard](screenshots/04-dashboard.png)
![Google Calendar](screenshots/05-calendar.png)
