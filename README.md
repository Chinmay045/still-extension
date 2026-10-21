# Still

Stop switching. Start finishing. A Chrome (Manifest V3) focus extension. No build step: plain JavaScript modules, all data in `chrome.storage.local`. The optional focus wallet uses a small server in `backend/`.

## Publish it

See `docs/LAUNCH.md`. `node scripts/build-store.mjs` builds the Chrome Web Store zip into `dist/`; `site/` is the public website with the privacy policy.

## Load it

1. Unzip `still-extension.zip`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped `extension` folder (the one with `manifest.json`).
4. Home opens in a new tab. Pin Still from the puzzle icon so the badge shows.

## Test it

| Check | What to do |
|---|---|
| Setup and focus circle | Home, **Setup**, type a task, **Start focus**. The circle tab opens with **Exit** (top right) and a control bar: timer length (−/+, 5/10/15/25) and music. Click the circle (or press Enter) to start the timer and go back to your last web tab. Nothing is blocked in the circle. |
| Blocking | Sites are blocked only from a Google Calendar event's start to its end. To try it now: **Block**, **Block now**, pick 25 min, then open youtube.com. You get the block page. The block page counts it; nothing is added to your Bucket. |
| Override | On the block page, **Open anyway** counts down (Settings, Override wait) and lets you through once. |
| Capture thought | Click Capture thought in the popup (or press Alt+P, Option+P on Mac). A small notes window opens: Enter adds a line, the toolbar adds a checklist, bullets or numbers (click a box to tick it), Ctrl+Enter or Esc saves. The timer keeps running. ☰ lists your notes: tick the circle to strike one off, the clock keeps it for Later, the bin deletes it (with Undo). |
| In-session dropdown | Click the timer pill at the bottom right of any page, or the toolbar icon. −5 / +5, switch music, park, exit. |
| Bucket review | **Bucket**: Next task / Later / Delete. The toolbar badge counts new items. |
| Summary | **Exit focus**, or let the timer run out (soft chime if on). |
| Focus wallet | Needs the wallet server (see `backend/README.md`). Settings, Focus wallet: sign in, add money (Razorpay test mode), pick a pledge. Then start a calendar-task block and open youtube.com: the block page shows the pledge, and **Break the task** asks you to confirm before taking it. |
| Points and streaks | Finish a session of 10 minutes or more (let the timer run out). The summary shows the points earned and your streak; **Insights** shows totals, streaks and the last 7 days. Ending early earns nothing and takes nothing away. Logic: `js/progress.js`; tests: `node --test tests/*.test.mjs`. |
| Calendar | Settings, Integrations, **Try a demo event** ("Onboarding PRD review" at 3:00 PM), then **Send a test nudge**. |

Alt+P can be changed at `chrome://extensions/shortcuts`. If another extension already owns Alt+P, Chrome leaves it unset; set it there.

## Real Google Calendar (optional)

The extension ID is fixed by the `key` in `manifest.json`: it is always **hjcpkhjkanikiahcjmhcblnnkloopnmc**, on any computer. So the Google redirect address never changes:

`https://hjcpkhjkanikiahcjmhcblnnkloopnmc.chromiumapp.org/`

You never edit files. In Still, open Settings, Integrations, **Connect Google Calendar** and follow the 5 steps shown there:

1. Google Cloud console: create a project called Still.
2. Enable the **Google Calendar API**.
3. Consent screen (Google Auth Platform): app name Still, audience **External**, then add your own Gmail under Audience, **Test users**.
4. Create an OAuth client of type **Web application**. Under **Authorized redirect URIs**, add the address above.
5. Copy the Client ID, paste it into Still and click Connect. Google says the app is unverified: click Continue.

Scope is read-only (`calendar.events.readonly`). A public Web Store launch needs Google verification for it. Note: the Web Store gives a published extension its own ID, so remove `key` before uploading and add the store ID's redirect address to the same client. `still/keys/still-key.pem` in the project is the private half of the key; keep it private.

## Files

- `background.js`: service worker. Session timer (`chrome.alarms`), calendar-task blocking (declarativeNetRequest rules from event start to end, state in `block`), capture window, badge, calendar polling and nudges.
- `offscreen.html` + `js/audio.js`: the five synthesized sounds (Web Audio, gain x0.75 into a compressor).
- `home.html`: Home, Setup, Bucket, Settings and Summary (hash routes).
- `popup.html`, `focus.html`, `blocked.html`, `capture.html`, `content.js` (floating timer and dropdown).
