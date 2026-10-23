# Deploy Nova

The app needs one Node web service for both the React UI and the Express API. It also uses `/ws/live` for Gemini Live voice sessions, so deploy it as a web service that supports long-lived WebSocket connections. The included `render.yaml` and `Dockerfile` configure that service for Render.

## Deploy with Render

1. Push this project to a private GitHub repository. Keep `.env` out of Git; `.gitignore` already excludes it.
2. In Render, create a Blueprint from that repository and select `render.yaml`.
3. In Firebase Console, enable Email/Password and Anonymous sign-in, and add the deployed `onrender.com` hostname to Authentication's authorized domains.
4. Enable Cloud Firestore in the Firebase project and publish `firestore.rules`.
5. Add `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and `API_KEY_ENCRYPTION_SECRET` in the Render service's Environment settings. Enter them as secrets; do not add them to the Dockerfile or repository. The service-account JSON must belong to the same Firebase project as `firebase-applet-config.json`. Generate `API_KEY_ENCRYPTION_SECRET` as a random 32-byte value encoded in hex and keep the same value across deploys.
6. Wait for the service health check at `/api/health` to pass, then open the generated `https://…onrender.com` address.

The app also connects to Cloud Firestore for shared memory. The server's local `data/` directory is ephemeral on hosted instances; persistent user memories must be stored in Firestore. The Android app's future on-device memory store is separate from this server memory.

Render's free web services can sleep when idle and their WebSocket connections can be interrupted during restarts or deploys. Use a paid always-on service if you need continuous voice availability. A valid Gemini key with available quota is also required for full AI and Live voice responses.
