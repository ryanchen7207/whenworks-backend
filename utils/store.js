import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

async function ensureFile(fileName) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, fileName);
  if (!existsSync(filePath)) await writeFile(filePath, "{}", "utf-8");
  return filePath;
}

export async function readStore(fileName) {
  const filePath = await ensureFile(fileName);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw || "{}");
}

export async function writeStore(fileName, data) {
  const filePath = await ensureFile(fileName);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
