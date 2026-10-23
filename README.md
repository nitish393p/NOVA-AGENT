# Nova AI Voice Agent

## Requirements

- Node.js 20.19+ or 22.12+
- A Gemini API key for voice and AI replies

## Setup

1. Install dependencies with `npm install`.
2. In Firebase Console, enable **Authentication → Sign-in method → Email/Password** and **Anonymous**, then confirm `localhost` is an authorized domain.
3. Create a Firebase service-account key for the same project. In PowerShell, copy `.env.example` to `.env` with `Copy-Item .env.example .env`, then set `GEMINI_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON`. The latter is the full service-account JSON on one line; keep both values private and never commit `.env`.
4. Enable **Cloud Firestore** in Firebase Console and publish `firestore.rules` to the same Firebase project. Memories are stored at `users/{uid}/memories/{memoryId}` and the API verifies each Firebase ID token before accessing them.
5. Set `API_KEY_ENCRYPTION_SECRET` to a private random 32-byte (64-character hex) value. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep the same value across restarts and deployments: account Gemini keys cannot be decrypted if it changes.
6. During account creation, users may add their own Gemini API key. The server encrypts it before storing it in that user's Firestore settings. Leaving the field blank uses the app's `GEMINI_API_KEY`.
7. Start the app with `npm run dev`.
8. Open <http://localhost:3000>, create an account with your email and password, or continue as a guest without entering credentials.

The app serves its React interface and API from the same local server. The `/api/health` endpoint reports whether a Gemini key is configured. Without a valid key and available quota, Gemini-powered features cannot respond.

## Production

Run `npm run build`, then start the production server with `NODE_ENV=production` set. In PowerShell, use `$env:NODE_ENV='production'; npm run start`. The server serves the generated `dist` directory.

Useful commands:

- `npm run lint` — TypeScript check
- `npm run build` — production client build
- `npm run clean` — remove generated build output
