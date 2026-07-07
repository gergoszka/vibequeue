# VibeQueue

A collaborative YouTube queue app.

## Prerequisites

- Node.js 18 or later
- npm 8 or later (workspaces support)

## Setup

1. **Install all dependencies** from the repo root:

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Copy the root example and fill in real values:
   ```bash
   cp .env.example .env
   ```

   Copy the backend example as well:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Start the backend** (from the repo root or the `backend/` directory):

   ```bash
   cd backend && npm run dev
   ```

   The API will be available at `http://localhost:3001`.
   Health check: `GET http://localhost:3001/health`

4. **Start the frontend** (in a separate terminal):

   ```bash
   cd frontend && npm run dev
   ```

   The app will be available at `http://localhost:5173`.

## Project Structure

```
vibequeue/
├── backend/          # Express API server
│   ├── src/
│   │   └── index.js  # Entry point
│   └── package.json
├── frontend/         # Vite + React app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example      # Root env var documentation
├── .gitignore
└── package.json      # npm workspaces root
```

## Environment Variables

See `.env.example` for all required variables and their descriptions.
