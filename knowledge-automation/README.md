# knowledge-automation (pure value track)

Runs on a separate Chrome instance (CDP port 9224), completely isolated from the self-promotion bot. This one is never allowed to mention the product.

## What it actually targets

- Monitors 8 subreddits: r/SEO, r/TechSEO, r/Wordpress, r/blogging, r/smallbusiness, r/Entrepreneur, r/digital_marketing, r/webdev.
- Searches for 7 query templates around real SEO problems: "why is my website not ranking", "google not indexing my site", "sitemap error", "meta description help", "impressions but no clicks", "on page seo help", "keyword research beginner".
- `intent/comment_prompt.md` explicitly instructs: "Do not promote anything." No product link, no mention of asimpletool.com, ever, in this track.

## The persona file

`intent/persona.md` is a genuinely detailed writing-style spec, not a generic tone guide. It defines a 16-item personalization checklist, 8 named comment "patterns" (short and direct, reason stack, metaphor plus metric, etc.), and a required length distribution across a day's comments (roughly 35% short, 40% medium, 25% long) so a profile's recent comments "look like one person wrote it." It also lists specific phrases to avoid because they read as AI ("Great question!", "Hope this helps!", "leverage", "synergy") and instructs keeping some typos and imperfect grammar on purpose.

## Timing

Same engine as reddit-automation: `config/timing.json` uses a 60-120s fetch-to-comment delay, 3-5 minutes between comments, and a 15-minute break per cycle, with the same 4-tier randomized delay between subreddits in `services/searchEngine.js`.
