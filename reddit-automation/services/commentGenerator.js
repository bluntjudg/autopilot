import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const QUEUE_PATH = "data/to_comment.json";
const PROMPT_PATH = "intent/comment_prompt.md";

/* ---------- helpers ---------- */

function readJSON(path) {
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, "utf-8");
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function buildPrompt(template, post) {
  const body =
    post.selftext && post.selftext.trim().length > 40
      ? post.selftext.trim()
      : `The post body is short. Use the title carefully.\nTitle: ${post.title}`;

  return template
    .replace("{{subreddit}}", post.subreddit)
    .replace("{{title}}", post.title)
    .replace("{{body}}", body);
}

/* ---------- core ---------- */

export async function generateCommentsOnly({ limit = 10 } = {}) {
  const queue = readJSON(QUEUE_PATH);
  const template = fs.readFileSync(PROMPT_PATH, "utf-8");

  const targets = queue.filter(p => p.status === "PENDING");

  if (targets.length === 0) {
    console.log("📭 No posts pending comment generation");
    return;
  }

  console.log(`✍️ Generating comments for ${Math.min(limit, targets.length)} posts`);

  let generated = 0;

  for (const post of targets) {
    if (generated >= limit) break;

    console.log(`🧠 Generating comment for: ${post.title}`);

    const prompt = buildPrompt(template, post);

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You personalize Reddit comments. You must ground the reply in the post body."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const comment = res.choices[0].message.content.trim();

    // HARD GUARD
    if (!comment.includes("https://asimpletool.com")) {
      console.warn(`⚠️ Skipping ${post.post_id} (website missing)`);
      continue;
    }

    post.generated_comment = comment;
    post.status = "COMMENT_READY";
    post.generated_at = new Date().toISOString();

    generated++;
    await new Promise(r => setTimeout(r, 1200));
  }

  writeJSON(QUEUE_PATH, queue);
  console.log(`✅ Generated ${generated} comments`);
}

/* ---------- COMPATIBILITY EXPORT ---------- */
export const generateCommentsForQueue = generateCommentsOnly;
