# Chrome Web Store listing for Still

Copy each field into the Developer Dashboard. Images are in `launch/store-images/`.

## Store listing tab

**Name:** Still: Focus, Block Sites, Park Thoughts

**Summary (132 characters max):**
Name one task, block distracting sites, and park stray thoughts. A calm focus timer with streaks and insights.

**Category:** Productivity → Workflow & Planning (or Productivity if that is the only option)

**Language:** English

**Description:**

Stop switching. Start finishing.

Still is a calm focus extension for Chrome. Name the one thing you're working on, start a timer, and Still quietly closes the sites that pull you away. When a stray thought shows up, park it in a second and keep going.

WHAT YOU GET

• Focus sessions: 10 or 15 minutes, or any length you like. The timer starts the moment you click Focus.
• Focus circles: a full-screen spinning circle and soft sound to settle into the work. Eight circles to pick from.
• Focus sounds: ambient music, 40 Hz gamma, beta pulse, cafe murmur, and white, pink or brown noise.
• Block now: block your distracting sites any time, for 25 minutes, an hour, a custom time, or until you stop it. Turn on the lock and there's no way around it until the time is up.
• Already-open tabs too: when blocking starts, tabs you already had open on those sites are blocked as well, and they come back exactly where you left them when it ends.
• A pause before you give up: stopping a block early takes a moment of reflection and a 3-second hold, so you stop on purpose, not on impulse.
• Capture thought (Alt+P, or Shift+Command+P on Mac): write a note, checklist or idea without leaving your tab. Review your Bucket later in about a minute.
• Insights: streaks, sessions completed and ended early, focus time by day, week and month, distractions held off, and your best time of day.
• Google Calendar (optional): get a nudge a few minutes before an event, and block sites while it runs. Read-only access.

PRIVATE BY DESIGN

Everything stays on your computer. No account, no tracking, no analytics, no ads. Calendar access is optional and read-only, and event details never leave your browser.

Privacy policy: https://still-focus-mu.vercel.app/privacy.html

**Screenshots (1280×800), in this order:**
1. `store-1-focus.png`: Pick one task and a length
2. `store-5-circle.png`: The focus circle with a live timer
3. `store-2-insights.png`: Insights with streaks and charts
4. `store-3-block.png`: Block now, any time
5. `store-4-blocked.png`: The calm block page

**Small promo tile (440×280):** `store-tile-440x280.png`

**Official URL / Homepage URL:** https://still-focus-mu.vercel.app/

**Support URL:** https://still-focus-mu.vercel.app/

## Privacy practices tab

**Single purpose:**
Still helps you focus on one task at a time: it times a focus session, blocks the distracting websites you choose while you focus, and lets you write down stray thoughts to review later.

**Permission justifications:**

| Permission | Justification |
|---|---|
| storage | Saves the user's settings, focus sessions, parked thoughts and streaks locally on the device. |
| alarms | Ends focus sessions and site blocks on time, schedules calendar nudges, and refreshes upcoming calendar events. |
| notifications | Tells the user when blocking starts and when a calendar event is about to begin. |
| declarativeNetRequest | Redirects the websites the user has chosen to block to Still's calm block page while a focus session or block is running. |
| tabs | Moves tabs that are already open on a blocked site to the block page when blocking starts, returns them to the same page when it ends, and opens or focuses Still's own pages. |
| identity | Lets the user optionally sign in with Google to give Still read-only access to their calendar events, used for nudges and blocking during events. |
| offscreen | Plays the focus sound the user picked while they work in other tabs. |
| Host permission `<all_urls>` | The sites to block are chosen by the user and can be any website, so blocking rules and the small in-page focus timer must be able to run on any site. Still does not read or collect page content or browsing history. |

**Are you using remote code?** No. All JavaScript is included in the package.

**Data usage:** Still does not send any user data to the developer or any third party. Settings, sessions and notes stay in `chrome.storage` on the device, and calendar events go straight from Google to the user's browser. My reading is that none of the data categories need to be ticked, because nothing is collected off the device. If you want to be conservative, tick **Personal communications** for calendar event titles and explain they stay on the device.

Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://still-focus-mu.vercel.app/privacy.html`

## Distribution tab

**Visibility:** Public. **Regions:** All regions. **Pricing:** Free.
