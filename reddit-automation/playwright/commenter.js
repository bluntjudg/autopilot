import fs from "fs";
import http from "http";
import { chromium } from "playwright";
import { cooldownTimer } from "../utils/sleep.js";

const CDP_ENDPOINT = "http://localhost:9222";
const QUEUE_PATH = "data/to_comment.json";
const COMMENTED_PATH = "data/commented_posts.json";

/* ---------------- utils ---------------- */

function readJSON(path) {
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, "utf-8");
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkCDP() {
  return new Promise(resolve => {
    http
      .get("http://localhost:9222/json/version", res => {
        resolve(res.statusCode === 200);
      })
      .on("error", () => resolve(false));
  });
}

async function submitWithKeyboard(page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
}

/* ---------------- core ---------------- */

async function postOne(page) {
  const queue = readJSON(QUEUE_PATH);
  const commented = readJSON(COMMENTED_PATH);

  const item = queue.find(p => p.status === "COMMENT_READY");
  if (!item) return false;

  console.log(`➡️ Commenting on: ${item.title}`);

  await page.goto(item.url, { waitUntil: "domcontentloaded" });
  await sleep(4000);

  const openBtn = await page.waitForSelector(
    'button:has-text("Add a comment"), button:has-text("Comment")',
    { timeout: 20000 }
  );

  await openBtn.click();
  await sleep(1200);

  const editor = await page.waitForSelector(
    'div[role="textbox"][contenteditable="true"]',
    { timeout: 20000 }
  );

  await editor.click();
  await sleep(500);

  await page.keyboard.type(item.generated_comment, { delay: 28 });

  await editor.evaluate(el =>
    el.dispatchEvent(new Event("input", { bubbles: true }))
  );

  await sleep(800);
  await submitWithKeyboard(page);
  await page.waitForTimeout(2500);

  console.log("✅ Comment submitted");

  item.status = "COMMENTED";
  item.commented_at = new Date().toISOString();

  commented.push({
    post_id: item.post_id,
    subreddit: item.subreddit,
    title: item.title,
    url: item.url,
    commented_at: item.commented_at
  });

  writeJSON(QUEUE_PATH, queue);
  writeJSON(COMMENTED_PATH, commented);

  await cooldownTimer(3, 5);
  return true;
}

/* ---------------- bootstrap ---------------- */

(async () => {
  console.log("🔗 Connecting to existing Chrome (CDP)");

  const cdpAlive = await checkCDP();
  if (!cdpAlive) {
    console.error("\n❌ Chrome is NOT running in CDP mode");
    console.error("👉 Start it like this:");
    console.error(
      "google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/chrome-cdp\n"
    );
    process.exit(1);
  }

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);

  let page = null;
  for (const context of browser.contexts()) {
    for (const p of context.pages()) {
      if (p.url().includes("reddit.com")) {
        page = p;
        break;
      }
    }
  }

  if (!page) {
    console.error("❌ No Reddit tab found. Open Reddit first.");
    process.exit(1);
  }

  await page.bringToFront();
  console.log("✅ Reddit tab attached");

  while (true) {
    const didPost = await postOne(page);
    if (!didPost) {
      console.log("📭 No more COMMENT_READY posts");
      break;
    }
  }

  console.log("🏁 Commenter finished cleanly");
})();
