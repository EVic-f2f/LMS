LMS env vars (used by Code/server.js)

Create `LMS/.env` from `LMS/.env.example` and set:

PORT=3000
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL= # optional alias
SUPABASE_SERVICE_ROLE_KEY=

The server loads env vars at startup via `node -r dotenv/config Code/server.js`.

