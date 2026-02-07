import fs from "fs";

export function readJSON(path) {
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

export function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}
