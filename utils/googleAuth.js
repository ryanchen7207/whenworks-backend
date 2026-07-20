import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback";

// Requesting calendar.readonly alongside profile/email means one "Continue
// with Google" click covers both sign-in AND calendar sync — no separate
// "connect calendar" OAuth flow needed.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function client() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server");
  }
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getGoogleAuthUrl() {
  return client().generateAuthUrl({
    access_type: "offline", // required to get a refresh_token, so calendar sync keeps working later
    prompt: "consent",
    scope: SCOPES,
  });
}

/** Exchanges the ?code= from Google's redirect for tokens + verified profile info. */
export async function exchangeGoogleCode(code) {
  const c = client();
  const { tokens } = await c.getToken(code);
  const ticket = await c.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    refreshToken: tokens.refresh_token || null, // only present on first consent
    accessToken: tokens.access_token,
  };
}

/** Turns a stored refresh_token back into a short-lived access token for API calls. */
export async function getFreshAccessToken(refreshToken) {
  const c = client();
  c.setCredentials({ refresh_token: refreshToken });
  const { token } = await c.getAccessToken();
  return token;
}
