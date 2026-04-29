import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

import { runSearchEngine } from "./services/searchEngine.js";
import { runAIFilter } from "./services/aiFilter.js";
import { buildCommentQueue } from "./services/queueManager.js";
import { generateCommentsForQueue } from "./services/commentGenerator.js";

const execPromise = promisify(exec);

const LAST_SEARCH_PATH = "data/last_search.json";
const SEARCH_INTERVAL_MIN = 30; // 30 min search interval
const COMMENT_BATCH_SIZE = 2; // safer for new / authority account

/* ---------------- UTIL ---------------- */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function safeReadJSON(path, fallback = []) {
  try {
    if (!fs.existsSync(path)) return fallback;
    const raw = fs.readFileSync(path, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getLastSearchTime() {
  if (!fs.existsSync(LAST_SEARCH_PATH)) return null;
  const raw = fs.readFileSync(LAST_SEARCH_PATH, "utf-8");
  if (!raw.trim()) return null;
  const parsed = JSON.parse(raw);
  return parsed.last_run ? new Date(parsed.last_run) : null;
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



function getHumanCommentDelay() {
  const r = Math.random();

  let min, max;

  if (r < 0.7) {
    min = 20 * 60;
    max = 50 * 60;
  } else if (r < 0.9) {
    min = 50 * 60;
    max = 90 * 60;
  } else {
    min = 10 * 60;
    max = 20 * 60;
  }

  const delaySeconds = Math.floor(Math.random() * (max - min) + min);

  return delaySeconds * 1000;
}

/* ---------------- COMMENTER ---------------- */

async function runCommenterSync() {
  try {
    const { stdout } = await execPromise("node playwright/commenter.js");
    console.log(stdout);
    return true;
  } catch (err) {
    console.error("Commenter error:", err.message);
    return false;
  }
}

/* ---------------- MAIN LOOP ---------------- */

(async function autopilot() {

  console.log("🧠 SEO Knowledge Automation Started");

  /* Initial pipeline run */

  if (shouldRunSearch()) {

    console.log("🔍 Initial pipeline run");

    await runSearchEngine();
    await runAIFilter();
    buildCommentQueue();

    await generateCommentsForQueue({
      limit: COMMENT_BATCH_SIZE
    });

    setLastSearchTime();
  }

  /* Infinite loop */

  while (true) {

    try {

      if (shouldRunSearch()) {

        console.log("🔍 Running full pipeline...");

        await runSearchEngine();

        await runAIFilter();

        buildCommentQueue();

        await generateCommentsForQueue({
          limit: COMMENT_BATCH_SIZE
        });

        setLastSearchTime();

      } else {

        await generateCommentsForQueue({
          limit: COMMENT_BATCH_SIZE
        });

      }

      await runCommenterSync();

    } catch (err) {

      console.error("❌ Loop error:", err.message);

    }

    /* SAFE HUMAN-LIKE DELAY */

    const delay = getHumanCommentDelay();

    console.log(
      `😴 Sleeping for ${Math.round(delay / 60000)} minutes`
    );

    await sleep(delay);

  }

})();
