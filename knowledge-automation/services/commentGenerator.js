import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const QUEUE_PATH = "data/to_comment.json";
const PROMPT_PATH = "intent/comment_prompt.md";
const PERSONA_PATH = "intent/persona.md";

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

function buildPrompt(template, post) {
  const body =
    post.selftext && post.selftext.trim().length > 40
      ? post.selftext.trim()
      : `Title: ${post.title}`;

  return template
    .replace("{{subreddit}}", post.subreddit)
    .replace("{{title}}", post.title)
    .replace("{{body}}", body);
}

/* ---------------- core ---------------- */

export async function generateCommentsForQueue({ limit = 2 } = {}) {
  const queue = readJSON(QUEUE_PATH);

  const targets = queue.filter(p => p.status === "PENDING");

  console.log("🧠 Pending posts found:", targets.length);

  if (!targets.length) return 0;

  const template = fs.readFileSync(PROMPT_PATH, "utf-8");
  const persona = fs.readFileSync(PERSONA_PATH, "utf-8");

  let generated = 0;

  for (const post of targets) {
    if (generated >= limit) break;

    console.log("➡ Generating for:", post.title);

    const basePrompt = buildPrompt(template, post);

    // Random length distribution
    const roll = Math.random();
    let lengthInstruction = "";

    if (roll < 0.35) {
      lengthInstruction = "Keep it very short (1-2 sentences).";
    } else if (roll < 0.75) {
      lengthInstruction = "Keep it medium length (3-5 sentences).";
    } else {
      lengthInstruction = "You may write longer if needed.";
    }

    const finalPrompt = `
${basePrompt}

${lengthInstruction}

Rules:
- No greetings.
- No corporate tone.
- Do not always end with a question.
- Avoid perfect blog structure.
- Slightly imperfect phrasing is okay.
`;

    try {
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.55,
        messages: [
          {
            role: "system",
            content: `
You are replying on Reddit as a real founder with SEO experience.

Follow this personality guide strictly:

${persona}

Hard rules:
- No "Hi" or soft intro.
- No "Hope this helps".
- No promotion.
- Match post type correctly.
`
          },
          {
            role: "user",
            content: finalPrompt
          }
        ]
      });

      const comment = res.choices?.[0]?.message?.content?.trim();

      if (!comment) {
        console.log("⚠️ Empty AI response");
        continue;
      }

      console.log("✅ Generated length:", comment.length);

      if (comment.length > 20) {
        const index = queue.findIndex(p => p.post_id === post.post_id);

        queue[index].generated_comment = comment;
        queue[index].status = "COMMENT_READY";
        queue[index].generated_at = new Date().toISOString();

        generated++;
      } else {
        console.log("⚠️ Skipped: too short");
      }

    } catch (err) {
      console.error("❌ AI generation failed:", err.message);
    }
  }

  writeJSON(QUEUE_PATH, queue);

  console.log("🎯 Total generated this cycle:", generated);

  return generated;
}
