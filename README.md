# Invoice Generator

A full-stack invoice management system built with Node.js, Express, MongoDB, and React.

## Project Structure

```
invoice-generator/
├── backend/   # Express API server
└── frontend/  # React (Vite) web app
```

---

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- Redis (local or cloud)

---

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev
```

Server runs on `http://localhost:5000`

### Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for access tokens |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens |
| `REDIS_URL` | Redis connection URL |
| `USE_RESEND` | `true` to use Resend for email |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM_ADDRESS` | Sender email address |
| `WEBHOOK_SECRET` | HMAC signing secret |
| `APP_ENCRYPTION_KEY` | 64-char hex key for AES-256 encryption |

---

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

App runs on `http://localhost:3000` and proxies `/api` requests to the backend.

---

## Running in Production

```bash
# Backend
cd backend && npm start

# Frontend — build and serve
cd frontend && npm run build
```

---

## Scripts

### Backend

| Script | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm test` | Run test suite |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
