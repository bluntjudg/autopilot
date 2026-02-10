import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

import { runSearchEngine } from "./services/searchEngine.js";
import { runAIFilter } from "./services/aiFilter.js";
import { buildCommentQueue } from "./services/queueManager.js";
import { generateCommentsForQueue } from "./services/commentGenerator.js";

const execPromise = promisify(exec);

/* ================= CONFIG ================= */

const LAST_SEARCH_PATH = "data/last_search.json";
const SEARCH_INTERVAL_MIN = 60;      // ✅ Less aggressive (was 10)
const LOOP_SLEEP_MS = 120 * 1000;    // ✅ 2 minutes (was 1 minute)
const COMMENT_BATCH_SIZE = 5;        // ✅ Generate 5 comments per cycle

/* ================= UTILS ================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function safeReadJSON(path, fallback = []) {
  try {
    if (!fs.existsSync(path)) return fallback;
    const raw = fs.readFileSync(path, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️ Failed reading ${path}: ${err.message}`);
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

function getMinutesUntilNextSearch() {
  const last = getLastSearchTime();
  if (!last) return 0;
  const diffMin = (Date.now() - last.getTime()) / 60000;
  return Math.max(0, Math.ceil(SEARCH_INTERVAL_MIN - diffMin));
}

/* ================= CHROME CHECK ================= */

async function isChromeRunning() {
  try {
    const response = await fetch("http://localhost:9222/json/version", {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/* ================= PIPELINE ================= */

/**
 * ✅ Stage 1–4: Search → Filter → Queue → Generate
 */
async function runStage1to4() {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 PIPELINE STARTED: Search → Filter → Queue → Generate");
  console.log("=".repeat(60));

  try {
    // ✅ 1. Fetch posts
    console.log("\n📡 Stage 1: Search Engine");
    await runSearchEngine();

    // ✅ 2. AI approval/rejection
    console.log("\n🧠 Stage 2: AI Filter");
    await runAIFilter();

    // ✅ 3. Build queue from approved posts
    console.log("\n📥 Stage 3: Queue Manager");
    buildCommentQueue();

    // ✅ 4. Generate comments for pending posts
    console.log("\n✍️  Stage 4: Comment Generator");
    await generateCommentsForQueue({ limit: COMMENT_BATCH_SIZE });

    console.log("\n" + "=".repeat(60));
    console.log("✅ PIPELINE COMPLETED");
    console.log("=".repeat(60));

  } catch (err) {
    console.error("\n❌ PIPELINE ERROR:", err.message);
    console.error(err.stack);
    throw err; // Re-throw to handle in main loop
  }
}

/* ================= COMMENTER (FIXED) ================= */

/**
 * ✅ FIXED: Run commenter synchronously with proper error handling
 */
async function runCommenterSync() {
  console.log("\n🚀 Starting commenter...");

  try {
    // ✅ Use spawn that waits for completion
    const { stdout, stderr } = await execPromise("node playwright/commenter.js");
    
    console.log(stdout);
    if (stderr) console.error(stderr);

    console.log("✅ Commenter finished");
    return true;

  } catch (err) {
    console.error("❌ Commenter error:", err.message);
    return false;
  }
}

/* ================= QUEUE STATUS ================= */

function getQueueStatus() {
  const queue = safeReadJSON("data/to_comment.json", []);
  
  const pending = queue.filter(p => p.status === "PENDING").length;
  const ready = queue.filter(p => p.status === "COMMENT_READY").length;
  const total = queue.length;

  return { pending, ready, total };
}

/* ================= AUTOPILOT ================= */

(async function autopilot() {
  console.log("\n" + "=".repeat(60));
  console.log("🤖 AUTOPILOT STARTED (24×7 MODE)");
  console.log("=".repeat(60));
  console.log(`⏱️  Search interval: ${SEARCH_INTERVAL_MIN} minutes`);
  console.log(`⏱️  Loop cycle: ${LOOP_SLEEP_MS / 1000} seconds`);
  console.log(`📝 Comment batch size: ${COMMENT_BATCH_SIZE}`);
  console.log("=".repeat(60));

  /* ---------- INITIAL BOOT ---------- */

  // ✅ Check Chrome availability
  const chromeRunning = await isChromeRunning();
  if (!chromeRunning) {
    console.warn("\n⚠️  WARNING: Chrome CDP not detected at localhost:9222");
    console.warn("   Commenting will fail until Chrome is started with:");
    console.warn("   google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/chrome-cdp\n");
  } else {
    console.log("✅ Chrome CDP detected and running\n");
  }

  // ✅ Initial search if needed
  if (shouldRunSearch()) {
    console.log("🔍 Running initial startup search");
    try {
      await runStage1to4();
      setLastSearchTime();
    } catch (err) {
      console.error("❌ Initial search failed:", err.message);
    }
  }

  /* ---------- MAIN LOOP ---------- */

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    
    console.log("\n" + "━".repeat(60));
    console.log(`🌀 CYCLE #${cycleCount} | ${new Date().toLocaleTimeString()}`);
    console.log("━".repeat(60));

    try {
      const queueStatus = getQueueStatus();
      
      console.log(`📊 Queue Status: ${queueStatus.total} total | ${queueStatus.pending} pending | ${queueStatus.ready} ready`);

      /* ========== ACTION 1: SEARCH ========== */
      
      if (shouldRunSearch()) {
        console.log("\n🔍 Search interval reached - running full pipeline");
        
        try {
          await runStage1to4();
          setLastSearchTime();
        } catch (err) {
          console.error("❌ Pipeline failed (will retry next cycle):", err.message);
        }
        
      } else {
        const minsLeft = getMinutesUntilNextSearch();
        console.log(`⏳ Next search in ${minsLeft} minutes`);
        
        /* ========== ACTION 2: GENERATE COMMENTS ========== */
        
        if (queueStatus.pending > 0) {
          console.log(`\n✍️  Generating comments for ${Math.min(COMMENT_BATCH_SIZE, queueStatus.pending)} pending posts`);
          
          try {
            await generateCommentsForQueue({ limit: COMMENT_BATCH_SIZE });
          } catch (err) {
            console.error("❌ Comment generation failed:", err.message);
          }
        }
      }

      /* ========== ACTION 3: POST COMMENTS ========== */
      
      // ✅ Refresh queue status after potential generation
      const updatedStatus = getQueueStatus();
      
      if (updatedStatus.ready > 0) {
        console.log(`\n🚀 ${updatedStatus.ready} comments ready to post`);
        
        // ✅ Check Chrome before attempting
        const chromeOk = await isChromeRunning();
        if (!chromeOk) {
          console.error("❌ Chrome CDP not available - skipping commenting");
        } else {
          const success = await runCommenterSync();
          
          if (success) {
            console.log("✅ Comment posted successfully");
          } else {
            console.log("⚠️  Commenting failed - will retry next cycle");
          }
        }
      } else {
        console.log("📭 No comments ready to post");
      }

    } catch (err) {
      console.error("\n❌ CYCLE ERROR (recovered):", err.message);
      console.error(err.stack);
    }

    /* ---------- SLEEP ---------- */

    console.log(`\n😴 Sleeping for ${LOOP_SLEEP_MS / 1000} seconds...`);
    console.log("━".repeat(60));
    
    await sleep(LOOP_SLEEP_MS);
  }
})();