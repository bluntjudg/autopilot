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
const SEARCH_INTERVAL_MIN = 10;          // search every 5 minutes
const LOOP_HEARTBEAT_MS = 60 * 1000;    // 1 minute loop tick

/* ================= UTILS ================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getLastSearchTime() {
  try {
    if (!fs.existsSync(LAST_SEARCH_PATH)) return null;

    const raw = fs.readFileSync(LAST_SEARCH_PATH, "utf-8");
    if (!raw.trim()) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.last_run) return null;

    return new Date(parsed.last_run);
  } catch {
    console.warn("⚠️ last_search.json invalid, resetting");
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

  const raw = readJSON("data/fetched_posts.json");
  const fresh = filterAlreadyCommented(raw);

  const approvedPosts = [];

  for (const post of fresh) {
    const result = await isPostRelevant(post);
    if (result?.approved === true) {
      approvedPosts.push(post);
    }
  }

  console.log(`✅ Approved ${approvedPosts.length} posts`);
  buildCommentQueue(approvedPosts);
}

/* ================= COMMENTER (LIVE OUTPUT) ================= */

function runCommenterLive() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["playwright/commenter.js"], {
      stdio: ["inherit", "pipe", "pipe"]
    });

    child.stdout.on("data", d => process.stdout.write(d.toString()));
    child.stderr.on("data", d => process.stderr.write(d.toString()));

    child.on("close", code => {
      if (code !== 0) reject(new Error(`commenter exited with ${code}`));
      else resolve();
    });
  });
}

/* ================= AUTOPILOT ================= */

(async () => {
  console.log("🤖 AUTOPILOT STARTED (24×7 MODE)");

  // Run search immediately on startup
  if (shouldRunSearch()) {
    console.log("🔍 Initial startup search");
    await runStage1to4();
    setLastSearchTime();
  }

  while (true) {
    console.log("\n🌀 New loop tick");

    const queue = readJSON("data/to_comment.json");
    const pending = queue.find(p => p.status === "PENDING");
    const ready = queue.find(p => p.status === "COMMENT_READY");

    /* 🔍 SEARCH CHECK */
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

    /* ✍️ GENERATE COMMENT */
    if (pending) {
      console.log("✍️ Stage 5A: Generating comment");
      await generateCommentsForQueue({ batchSize: 1 });
    }

    /* 🚀 POST COMMENT */
    if (ready) {
      console.log("🚀 Stage 5B: Posting comment");
      await runCommenterLive();
    }

    /* 💤 ALWAYS SLEEP */
    console.log("😴 Loop complete → sleeping 1 min");
    await sleep(LOOP_HEARTBEAT_MS);
  }
})();
