import { runSearch } from "./searchEngine.js";
import { runCommenter } from "./commentGenerator.js";
import { sleep } from "../utils/sleep.js";
import fs from "fs";

const SEARCH_INTERVAL_MINUTES = 10;
const SEARCH_INTERVAL_MS = SEARCH_INTERVAL_MINUTES * 60 * 1000;

/**
 * 🔍 Search loop (rate-limited, independent)
 */
async function searchLoop() {
  console.log("🔍 Search loop started");

  while (true) {
    const startedAt = Date.now();

    try {
      await runSearch();
    } catch (err) {
      console.error("❌ Search error:", err.message);
    }

    const elapsed = Date.now() - startedAt;
    const waitTime = Math.max(SEARCH_INTERVAL_MS - elapsed, 0);

    console.log(
      `⏳ Next search in ${Math.round(waitTime / 1000)} seconds`
    );

    await sleep(waitTime);
  }
}

/**
 * 💬 Comment loop (continuous, non-blocking)
 */
async function commentLoop() {
  console.log("💬 Comment loop started");

  while (true) {
    try {
      const didWork = await runCommenter();

      // If no comments were made, back off slightly
      if (!didWork) {
        await sleep(15_000); // 15 seconds
      }
    } catch (err) {
      console.error("❌ Comment error:", err.message);
      await sleep(30_000);
    }
  }
}

/**
 * 🚀 Start automation
 */
export async function startScheduler() {
  console.log("🚀 Automation started");

  // Fire both loops in parallel
  searchLoop();
  commentLoop();
}
