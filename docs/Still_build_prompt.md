# Build prompt: Still, a Chrome focus extension

Copy everything below the line into Claude Code or Google AI Studio. Attach these files with it: the Still logo (ring + wordmark), the ring icon, the before/after slider image, the hero pink ring, and the three focus circle images (Vortex, Drift, Halo).

---

You are a senior Chrome extension engineer and product designer. Build **Still**, a Chrome Manifest V3 focus extension, end to end, ready to load unpacked and later publish to the Chrome Web Store.

## 1. Product in one line

Still helps knowledge workers (PMs, engineers, designers) stop switching tabs and finish one task. You name one task, Still blocks distracting sites, plays focus sound, and gives every stray thought a place to land so you never leave the tab you're on.

Tagline: "Stop switching. Start finishing." Supporting line: "Focus, beautifully kept."

## 2. Tech stack and constraints

- Chrome Manifest V3. Plain TypeScript + Vite (or vanilla JS if simpler). No backend for v1. All data is in `chrome.storage.local`.
- Permissions: `storage`, `alarms`, `notifications`, `declarativeNetRequest`, `tabs`, `identity` (only for the Calendar feature), `offscreen` (for audio).
- Pages to build: `home.html` (dashboard with nav), `popup.html` (toolbar popup), `focus.html` (focus circle, full tab), `blocked.html` (block page), `capture.html` (the 3×3 inch capture window), plus a background service worker.
- Audio has to play from an offscreen document, because MV3 service workers can't play audio.
- Accessibility: every control works by keyboard, has visible focus rings, and respects `prefers-reduced-motion` (turn off spins, typing and fades).
- Do not use blur effects anywhere.

## 3. Visual design system

Light, Apple-like, lots of white space. Dark surfaces only for in-session overlays.

- Fonts: headings in **Inter Tight 500** with tight letter spacing (-0.02em to -0.03em). Body in **Inter**.
- Brand gradient: `linear-gradient(90deg, #8B3DFF 0%, #D63DD0 100%)`. Use it for primary buttons and the capture box header.
- Violets: #9B4DF5, #7A2BF5, #5B21B6, #6B2FD6. Lavender surfaces: #F7F2FE, border #E6DAF7, track #F2EEF8.
- Greys: #EEEBF3, #E4E0EC, #8E8E93, #48484A, #6E6E73. Body text #1D1D1F.
- Dark panels: `rgba(23,21,28,0.97)` with white text.
- Whenever the word "Still" appears inside a sentence, wrap it in `.still-word`: violet (#7A2BF5), bolder weight, capital S.
- Pill buttons (border-radius 999px), cards with 14 to 18px radius, soft violet shadows.
- Kind chips: Task (#F1E8FE bg / #6B2FD6 text), Link (#E8F0FE / #1F5FC8), Idea (#FDEBF7 / #B0308F).

## 4. Screens and features

### 4.1 Home (dashboard, `home.html`)

A white explainer page that is also the dashboard.

- Top nav only: logo on the left. Setup, Bucket, Settings and a dynamic Calendar button on the right.
- The Calendar nav button has three states:
  1. "Connect Calendar" when no calendar is linked.
  2. "Calendar synced" when linked but nothing is coming up.
  3. "Upcoming task: 3:00 PM", showing the real start time of the next event. Never show "in 10 minutes" style wording.
- Hero: the pink ring image, the headline "Stop switching. Start finishing." in an elegant, high-contrast style, and a curiosity pill "Your workday, with and without Still ↓" that scrolls to the slider.
- **Before/after slider**, titled "Less noise. More you." with the caption "Drag the handle to compare."
  - Use the user's exact image. The left half is the distracted person and the right half is the focused "Still" card.
  - Each half sits in an overflow-hidden wrapper, using `object-fit: cover` anchored to the divider. No blur.
  - The range runs from 20 to 80 and **defaults to 80**, so the distracted side shows first and invites a slide.
  - The handle is a white pill (140×60) reading "‹ Go Still".
- A "One task" tile that cycles through PM tasks with a typing effect: "Write the PRD for onboarding", "Synthesize 8 user interviews", "Prioritize the roadmap with RICE", "Draft the launch plan", "System matters".
- A blocked-sites tile showing youtube.com, x.com and reddit.com struck through.
- The page ends with an install CTA card: logo, one line, "Add to Chrome" in the gradient.
- Do NOT add: a bento stats dashboard, a dark full page, a black announcement bar, or a way to start focus from Home.

### 4.2 Setup

The page where a session is planned.

- **Task**: one text field, "What's the one thing?"
- **Length**: segmented control with 25 min / 50 min / Custom. Custom shows a number input (1 to 240 minutes).
- **Focus circle**: pick Vortex (default), Drift or Halo.
- **Sound**: pick one, with a preview button on each.
  - Ambient instrumental (default): music with no lyrics.
  - Gamma 40 Hz binaural: needs headphones.
  - Beta pulse music: a 16 Hz pulse.
  - Cafe murmur.
  - Silence.

  Synthesize these with the Web Audio API (oscillators, noise and filters). Don't ship audio files.
- **Volume**: a custom draggable slider using pointer events with pointer capture, so you can drag left and right as well as click. Keep a hidden native range input for keyboard users. Default is 70. Run the output through gain ×0.75 and a DynamicsCompressor so it is loud but not clipped.
- **Blocked sites**: chips you can add and remove. Defaults are youtube.com, x.com and reddit.com.
- Primary button: "Start focus" (gradient).
- No calendar strip on Setup.

### 4.3 Focus circle (`focus.html`)

A full black screen with one large spinning spiral image (Vortex, Drift or Halo) that slowly "breathes".

- Clicking the circle begins work.
- Gamma sound starts here if it was chosen.
- There's a setting to dim the circle after 9 pm.

### 4.4 Working state and session dropdown

During a session, the user stays on their own tabs. Still adds a small floating control (a content script, or the popup when its toolbar icon is clicked) that opens an **in-session dropdown**:

- **Timer**: time left, live countdown, −5 min and +5 min buttons.
- **Music**: the sound list, with the current one highlighted. Switching is instant.
- **Park a thought (Alt+P)**: opens the capture box.
- **Exit focus**: ends the session and shows the summary.

### 4.5 Block page (`blocked.html`)

Use `declarativeNetRequest` dynamic rules to redirect blocked domains here, only while a session is running.

- Headline: "Take one slow breath. The thing you came for is safe."
- **Auto-park**: the blocked URL is saved to the Bucket automatically. Show a lavender note: "Saved to your bucket for later · {url}".
- A park input with the placeholder "Anything else on your mind? Press Enter to park it". Enter saves.
- A "Return to work" gradient button that goes back to the previous tab.
- **Override**: "Open anyway" starts a wait countdown (15, 30 or 60 seconds, from Settings) before letting the user through once. Count each override.
- Show "{n} blocked this session".

### 4.6 Quick capture box (Alt+P), modelled on Microsoft Sticky Notes

This is a key feature. Capture has to take under 3 seconds and must never move the user off their tab.

- **Shortcut**: register it in `manifest.json` under `commands`, as `"suggested_key": { "default": "Alt+P", "mac": "Alt+P" }`. On Mac this is Option+P. Users can change it at chrome://extensions/shortcuts.
  - Do not use Ctrl+Shift+D or Ctrl+O, because Chrome already uses them.
  - Also open the box from the dropdown and the popup.
- **Window**: open `capture.html` with `chrome.windows.create({ type: 'popup', width: 288, height: 288 })`. That's a 3×3 inch perfect square at 96 dpi. Place it near the top-right of the current window.
- **Layout**:
  - A 40px gradient header with the ring icon (white) and the title "Still capture".
  - On the right of the header: **+** (new note), **☰ {count}** (past thoughts), and **✕** (close).
  - The body is a large white textarea with the placeholder "What's pulling at you? Jot it down and get back to work." It is autofocused.
  - The footer reads "Enter saves · Shift+Enter new line", with a gradient Save button.
- **Behaviour**:
  - Enter saves, then the window closes and a quiet toast or notification says "Parked. Back to work."
  - Shift+Enter adds a new line. Esc closes without saving.
- **Past thoughts (one button)**: ☰ flips the same square to a scrollable list of every captured thought, newest first. Each row shows the text (one line, ellipsis), a kind chip and when it was captured.
  - Clicking a row opens it back in the note to read or edit. The title changes to "Edit thought" and the button becomes Update.
  - **+** returns to a blank note.

### 4.7 Bucket (review page)

The subtitle: "Thoughts you parked instead of switching tabs. Review them one at a time, it takes about a minute."

- **Auto-sort** each item when it is saved:
  - **Link** if it looks like a URL.
  - **Task** if the first word is a common verb (check, look, read, write, email, call, fix, book, buy, review, send, update, ask, schedule, plan, draft, research, follow).
  - **Idea** otherwise.
- **Review**: new items show one card at a time, with a progress bar and "1 of 3". The card shows the kind chip, "Parked {time} · from block page" if it was auto-parked, and the text in large type. It has three buttons:
  - **Next task**: moves the item into Setup as the next session's task, then removes it.
  - **Later**: keeps it.
  - **Delete**: removes it.
- When review is done, show an "All clear" banner.
- **Later section**: items are grouped under Tasks, Links and Ideas. Items 7 or more days old fade to 50% opacity and show "archives tomorrow". A daily `chrome.alarms` job archives items older than 8 days.
- The Bucket nav item shows a badge with the count of **new** items. Mirror that count on the toolbar icon with `chrome.action.setBadgeText`.

### 4.8 Session summary

Shown on exit or when the time is up, with an optional soft chime.

- Minutes focused, the task, sites blocked, the number of impulses blocked, overrides, and thoughts parked.
- Two buttons: "Review bucket" and "Start another".

### 4.9 Settings

- Blocked sites list (add and remove).
- Override wait: 15 / 30 / 60 sec.
- Toggles:
  - Chime when time is up.
  - Open the focus circle on start (turn off to go straight to work).
  - Dim the circle after 9 pm.
- Integrations: Google Calendar connect and disconnect.
- Notifications: lead time 5 / 10 / 15 min.
- The Alt+P shortcut, with a link to chrome://extensions/shortcuts to change it.

### 4.10 Calendar focus nudges (v1.1, build behind a setting)

- Google Calendar only, with the **read-only** scope `https://www.googleapis.com/auth/calendar.events.readonly`, through `chrome.identity.getAuthToken`. Google Tasks comes later.
- A `chrome.alarms` job polls the next events every 5 minutes and schedules a nudge N minutes before each event (5, 10 or 15).
- The nudge is a `chrome.notifications` notification titled "{Event} starts at 3:00 PM", with at most 2 buttons:
  - **Prepare my focus session**: opens Setup with the event title filled in as the task and the length taken from the event duration.
  - **Open dashboard**: opens Home with the full nav.

  There are no Snooze or Dismiss buttons.
- The approach is to help the user prepare, never to block automatically.
- Example event for testing: "Onboarding PRD review".
- Note for publishing: the Calendar scope needs Google OAuth verification before a public launch.

### 4.11 Toolbar popup

- If no session is running: logo, task field, "Start focus", and links to Bucket and Home.
- During a session: the same controls as the in-session dropdown (timer ±5, music, Park a thought, Exit).

## 5. Data model (`chrome.storage.local`)

```ts
type Kind = 'task' | 'link' | 'idea';
interface Parked { id: string; text: string; kind: Kind; status: 'new' | 'later' | 'archived'; createdAt: number; source: 'capture' | 'block' | 'manual'; }
interface Session { id: string; task: string; plannedMin: number; startedAt: number; endsAt: number; theme: 'vortex' | 'drift' | 'halo'; sound: 'ambient' | 'gamma' | 'beta' | 'cafe' | 'off'; volume: number; blocked: string[]; impulses: number; overrides: number; parkedCount: number; fromCalendar?: boolean; }
interface Settings { sites: string[]; overrideWait: 15 | 30 | 60; chime: boolean; autoCircle: boolean; nightDim: boolean; calendarConnected: boolean; nudgeLeadMin: 5 | 10 | 15; }
```

The service worker owns the session timer (`chrome.alarms`, so it survives the worker being suspended) and broadcasts state to the open pages with `chrome.runtime` messages.

## 6. Build order

1. Manifest, service worker, storage layer, and the session start/stop timer.
2. Setup, Focus circle, blocking with declarativeNetRequest, Block page with auto-park and override.
3. The Alt+P capture window with past thoughts, then Bucket review and auto-sort.
4. Offscreen audio engine with the 5 sounds and volume.
5. In-session dropdown and popup, then the Session summary.
6. Home page with the slider, Settings, toolbar badge.
7. Calendar nudges behind a setting.

After each step, tell me how to load the extension unpacked and what to click to test that step.

## 7. Acceptance checks

- With a session running, visiting youtube.com shows the block page, and its URL appears in the Bucket as a Link.
- Alt+P (Option+P on Mac) opens a 288×288 square from any tab. Typing and pressing Enter saves and closes it in under 3 seconds. ☰ lists past thoughts, and clicking one opens it for editing.
- Bucket review handles each item with one click. The badge count drops as items are reviewed.
- Volume can be dragged smoothly. Sound keeps playing when the user switches tabs.
- −5 and +5 change the time left immediately. Exit focus shows the summary.
- Nothing is blurred, every screen works by keyboard, and reduced motion stops all animation.
