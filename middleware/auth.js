import { verifyToken } from "../utils/auth.js";

function extractToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Blocks the request with 401 if there's no valid token. */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Sign in required" });
  req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}

/** Attaches req.user if a valid token is present, but doesn't block otherwise. */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  const payload = token && verifyToken(token);
  if (payload) req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}
