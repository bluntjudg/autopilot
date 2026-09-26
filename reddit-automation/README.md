# reddit-automation (self-promotion track)

Runs on a dedicated Chrome instance (CDP port 9222). This is the half of the pipeline that's allowed to mention the product. Its job is marketing only: finding threads where self-promotion is explicitly welcome and pitching asimpletool.com there.

## What it actually targets

- Monitors 30 subreddits (r/startups, r/SaaS, r/indiehackers, r/buildinpublic, r/microsaas, r/SaaSSolopreneurs, r/EntrepreneurRideAlong, and 23 more, see `config/subreddits.json`).
- Searches each one for 5 query templates: "what are you building", "saas ideas", "today I built", "looking for feedback", "side project".
- Before anything gets commented on, an approval step (`services/aiFilter.js`) checks the post against `intent/personalization.md`, which only approves posts that **explicitly** invite people to share what they're building (e.g. "What are you building??", "build in public", a weekly check-in thread). Founder stories, indirect promo, and plain advice requests are rejected even if they're topically related. Verified by reading the approval prompt directly.

## Two models, split by job

Comment generation (`services/commentGenerator.js`) hardcodes `gpt-4o-mini`. The approval/filtering call (`services/aiFilter.js`, via `services/aiClient.js`) reads its model from `process.env.OPENAI_MODEL`, set to `gpt-5-nano` for cost reasons, since the filtering call runs on every fetched post and only needs to output one word (APPROVE/REJECT), while comment generation runs far less often and needs more quality.

## How the link gets written in

`intent/comment_prompt.md` has a hard rule for the product link: it can never end a sentence or be followed by punctuation, it has to flow straight into a lowercase word ("...built https://asimpletool.com after running into the same issue"). The generator checks the model's output for the literal string `https://asimpletool.com`, and if it's missing, retries once more at a higher temperature before giving up on that post.

## Human-like posting

`playwright/commenter.js` connects to an already-logged-in Chrome tab over CDP (not the Reddit API) and types the generated comment via `page.keyboard.type(..., { delay: 28 })`, then submits with Ctrl+Enter. `services/searchEngine.js` waits a randomized delay between subreddits pulled from a 4-tier distribution (55% chance 40-85s, 25% chance 85-150s, 15% chance 17-40s, 5% chance 150-300s), plus 3-5 minutes between actual comments and a 15-minute break per full cycle. Failed subreddit fetches get an exponential-backoff cooldown (2^n x 5 minutes, capped at 120).

## Cost tracking caveat

`services/aiFilter.js` estimates spend as `total_tokens * 0.00015 / 1000` and labels it "GPT-4 pricing" in a comment, but this cost line covers the filtering calls, which actually run on `gpt-5-nano`. Real gpt-5-nano pricing is $0.05/1M input tokens and $0.40/1M output tokens, both well under the flat $0.00015/1K (=$0.15/1M) rate the code applies to every token. Since each filtering call is almost all input tokens (a full prompt in, one word out), the logged figure is likely an overestimate of the real filtering cost, not an accurate bill.
