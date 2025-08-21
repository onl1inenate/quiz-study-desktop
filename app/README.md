# Quiz-First Study App (Gizmo.ai-inspired)

## Setup

### Backend
cd app/backend
cp ../.env.example ../.env   # set OPENAI_API_KEY in app/backend/.env
# Optional: tweak OPENAI_TIMEOUT_MS (default 600000 ms) or OPENAI_MAX_RETRIES for API calls
npm i
npm run dev   # http://localhost:3001

### Frontend
cd app/frontend
npm i
npm run dev   # http://localhost:5173
