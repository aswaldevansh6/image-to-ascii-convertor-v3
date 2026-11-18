# Smart ASCII Studio Backend

Node.js + Express + PostgreSQL API for the separate Vercel frontend.

## Includes
- Signup and login with bcrypt password hashing
- JWT sessions (7 days)
- Save ASCII output and conversion settings
- List the latest 100 saved conversions
- Read or delete a saved conversion
- Users can access only their own records

## Local setup
1. Install Node.js 20+.
2. Create a PostgreSQL database (Neon is suitable).
3. Copy `.env.example` to `.env` and fill in the values.
4. Run `npm install`, then `npm start`.
5. Tables are created automatically at startup.

## Deploy on Render
Create a new Web Service connected to this backend repository:
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `DATABASE_URL`: Neon PostgreSQL connection string
  - `JWT_SECRET`: random secret of at least 32 characters
  - `FRONTEND_URL`: exact Vercel origin, e.g. `https://your-project.vercel.app`
  - `NODE_ENV`: `production`

Test: `https://YOUR-RENDER-SERVICE.onrender.com/api/health`

## API
- `POST /api/auth/register` — `{ "name", "email", "password" }`
- `POST /api/auth/login` — `{ "email", "password" }`
- `GET /api/auth/me` — Bearer token
- `POST /api/conversions` — Bearer token; `{ "title", "asciiText", "settings" }`
- `GET /api/conversions` — Bearer token
- `GET /api/conversions/:id` — Bearer token
- `DELETE /api/conversions/:id` — Bearer token

This stores ASCII text and settings, not uploaded image files. Never commit `.env` or put secrets in frontend JavaScript.
