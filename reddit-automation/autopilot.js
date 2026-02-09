import fs from "fs";
import { spawn } from "child_process";

import { runSearchEngine } from "./services/searchEngine.js";
import { readJSON } from "./services/postStore.js";
import { filterAlreadyCommented } from "./services/dedupe.js";
import { isPostRelevant } from "./services/aiFilter.js";
import { buildCommentQueue } from "./services/queueManager.js";
import { generateCommentsForQueue } from "./services/commentGenerator.js";

/* ================= CONFIG ================= */

const LAST_SEARCH_PATH = "data/last_search.json";
const SEARCH_INTERVAL_MIN = 10;     // how often to search
const LOOP_SLEEP_MS = 60 * 1000;    // loop heartbeat (1 min)

/* ================= UTILS ================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function safeReadJSON(path, fallback = []) {
  try {
    if (!fs.existsSync(path)) return fallback;
    const raw = fs.readFileSync(path, "utf-8");
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    console.warn(`⚠️ Failed reading ${path}, using fallback`);
    return fallback;
  }
}

function getLastSearchTime() {
  try {
    if (!fs.existsSync(LAST_SEARCH_PATH)) return null;
    const raw = fs.readFileSync(LAST_SEARCH_PATH, "utf-8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    return parsed.last_run ? new Date(parsed.last_run) : null;
  } catch {
    return null;
  }
}

function setLastSearchTime() {
  fs.writeFileSync(
    LAST_SEARCH_PATH,
    JSON.stringify({ last_run: new Date().toISOString() }, null, 2)
  );
}

function shouldRunSearch() {
  const last = getLastSearchTime();
  if (!last) return true;
  const diffMin = (Date.now() - last.getTime()) / 60000;
  return diffMin >= SEARCH_INTERVAL_MIN;
}

/* ================= STAGE 1–4 ================= */

async function runStage1to4() {
  console.log("\n🔄 Stage 1–4: Search → Filter → Queue");

  await runSearchEngine();

  const raw = safeReadJSON("data/fetched_posts.json", []);
  const fresh = filterAlreadyCommented(raw);

  const approved = [];

  for (const post of fresh) {
    try {
      const res = await isPostRelevant(post);
      if (res?.approved === true) approved.push(post);
    } catch {
      console.warn("⚠️ relevance check failed, skipping post");
    }
  }

  console.log(`✅ Approved ${approved.length} posts`);
  buildCommentQueue(approved);
}

/* ================= COMMENTER (NON-BLOCKING) ================= */

/**
 * IMPORTANT:
 * - Fire-and-forget
 * - Must NOT be awaited
 * - Commenter may run cooldowns internally
 */
function runCommenterDetached() {
  console.log("🚀 Spawning commenter (non-blocking)");

  const child = spawn("node", ["playwright/commenter.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true
  });

  child.stdout.on("data", d => process.stdout.write(d.toString()));
  child.stderr.on("data", d => process.stderr.write(d.toString()));

  child.unref(); // 🔑 allow parent loop to continue
}

/* ================= AUTOPILOT ================= */

(async function autopilot() {
  console.log("🤖 AUTOPILOT STARTED (24×7 MODE)");

  // Initial startup search
  if (shouldRunSearch()) {
    console.log("🔍 Initial startup search");
    await runStage1to4();
    setLastSearchTime();
  }

  while (true) {
    console.log("\n🌀 New loop tick");

    try {
      const queue = safeReadJSON("data/to_comment.json", []);
      const hasPending = queue.some(p => p.status === "PENDING");
      const hasReady = queue.some(p => p.status === "COMMENT_READY");

      /* 🔍 SEARCH */
      if (shouldRunSearch()) {
        console.log("🔍 Search interval reached → running search");
        await runStage1to4();
        setLastSearchTime();
      } else {
        const last = getLastSearchTime();
        if (last) {
          const minsLeft = Math.ceil(
            SEARCH_INTERVAL_MIN -
            (Date.now() - last.getTime()) / 60000
          );
          console.log(`⏳ Next search in ~${minsLeft} min`);
        }
      }

      /* ✍️ GENERATE */
      if (hasPending) {
        console.log("✍️ Stage 5A: Generating comment");
        await generateCommentsForQueue({ batchSize: 1 });
      }

      /* 🚀 POST (NON-BLOCKING) */
      if (hasReady) {
        runCommenterDetached(); // DO NOT await
      }

    } catch (err) {
      console.error("❌ Loop error (recovered):", err);
    }

    console.log("😴 Loop sleeping 1 min");
    await sleep(LOOP_SLEEP_MS);
  }
})();
