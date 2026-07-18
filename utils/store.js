import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "sessions.json");

async function ensureStore() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) await writeFile(DATA_FILE, "{}", "utf-8");
}

export async function readSessions() {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw || "{}");
}

export async function writeSessions(sessions) {
  await ensureStore();
  await writeFile(DATA_FILE, JSON.stringify(sessions, null, 2), "utf-8");
}
