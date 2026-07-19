import { Router } from "express";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "../utils/store.js";
import { hashPassword, verifyPassword, signToken } from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const FILE = "users.json";

function publicUser(user) {
  const { id, name, email } = user;
  return { id, name, email };
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

export default router;
