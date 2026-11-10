---
name: browser-check
description: Open app routes in headless Chromium at a wide and a narrow size, look at the screenshots, and report what is seen with any console errors or failed requests. Use when a task asks for a browser check, or to confirm a frontend change works in the real app.
argument-hint: <route> [<route> ...] [what to look for]
---

# Browser check

Routes and what to look for: $ARGUMENTS

The check runs `frontend/naturewatch/scripts/browser-check.mjs` with Playwright's Chromium. It needs nothing else.

1. If Chromium is missing, run `cd frontend/naturewatch && npx playwright install chromium` once. It goes to the user cache, not the repo.
2. Run from `frontend/naturewatch`, writing to a new folder in the scratchpad:

   ```bash
   node scripts/browser-check.mjs --out <scratchpad>/browser-check-<name> /places /places/<id>
   ```

   - The script reuses a server on `http://localhost:5173` or starts `vite` there and stops it afterwards. The dev server reads `.env`, so the data comes from the hosted Supabase project. The tile bucket allows that origin.
   - Each route is opened at 1440×900 (wide) and 390×844 (narrow).
   - `--click "<text>"` clicks the first element with that text, in order. `--wait <ms>` sets the pause after loading and after each click (default 1500). `--full` takes full-page screenshots.
   - For anything more, such as clicking a boundary on the map or typing a search, write a steps module in the scratchpad that exports `default async (page, { route, viewport }) => { … }` and pass it with `--steps <file>`.
3. Read every screenshot it prints. Describe what each one shows, wide and narrow, against what the task expects: text, layout, wrapping, and anything cut off or overlapping.
4. Report every line under a screenshot: console errors, page errors, failed requests, and HTTP 400 or higher. Run a route again before blaming the change. A first call after a deploy or migration can be slow, and `anon` has a 3 second statement timeout. Say if a problem came and went.
5. Do not commit screenshots or `report.json`. Do not point `--base` at the deployed apps unless asked.
