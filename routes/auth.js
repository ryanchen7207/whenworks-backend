import { Router } from "express";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "../utils/store.js";
import { hashPassword, verifyPassword, signToken } from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { getGoogleAuthUrl, exchangeGoogleCode } from "../utils/googleAuth.js";

const router = Router();
const FILE = "users.json";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function publicUser(user) {
  const { id, name, email, hasGoogleCalendar } = user;
  return { id, name, email, hasGoogleCalendar: !!hasGoogleCalendar };
}

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const users = await readStore(FILE);
  const normalizedEmail = email.trim().toLowerCase();
  const exists = Object.values(users).some((u) => u.email === normalizedEmail);
  if (exists) return res.status(409).json({ error: "an account with that email already exists" });

  const id = nanoid(10);
  const user = {
    id,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users[id] = user;
  await writeStore(FILE, users);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const users = await readStore(FILE);
  const normalizedEmail = email.trim().toLowerCase();
  const user = Object.values(users).find((u) => u.email === normalizedEmail);
  if (!user) return res.status(401).json({ error: "invalid email or password" });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "invalid email or password" });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const users = await readStore(FILE);
  const user = users[req.user.id];
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({ user: publicUser(user) });
});

// Step 1: send the user to Google's consent screen
router.get("/google/start", (req, res) => {
  try {
    res.redirect(getGoogleAuthUrl());
  } catch (err) {
    res.status(500).send(`Google sign-in isn't configured yet: ${err.message}`);
  }
});

// Step 2: Google redirects back here with a ?code=. Exchange it, create or
// update the user, then hand off to the frontend with our own JWT so the
// rest of the app doesn't need to know Google was involved.
router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code from Google");

  try {
    const google = await exchangeGoogleCode(code);
    const users = await readStore(FILE);

    let user = Object.values(users).find((u) => u.googleId === google.googleId || u.email === google.email);

    if (!user) {
      const id = nanoid(10);
      user = {
        id,
        name: google.name,
        email: google.email,
        passwordHash: null, // Google-only account, no password set
        googleId: google.googleId,
        googleRefreshToken: google.refreshToken,
        hasGoogleCalendar: !!google.refreshToken,
        createdAt: new Date().toISOString(),
      };
      users[id] = user;
    } else {
      user.googleId = google.googleId;
      // Google only sends a refresh_token on the very first consent, so
      // don't overwrite a previously-stored one with null on repeat logins.
      if (google.refreshToken) {
        user.googleRefreshToken = google.refreshToken;
        user.hasGoogleCalendar = true;
      }
    }

    await writeStore(FILE, users);
    const token = signToken(user);
    res.redirect(`${FRONTEND_URL}/oauth-complete?token=${encodeURIComponent(token)}`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/oauth-complete?error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
