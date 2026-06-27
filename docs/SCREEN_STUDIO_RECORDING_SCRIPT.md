# GreenPath Screen Studio Recording Script

Target length: **4:35**. Hard maximum: **5:00**.

Use this as the exact narration and shot list for the Youth Code x AI Hackathon
submission video. The structure matches the current GreenPath main branch:
laptop-style hero, Pathway Finder, deadline tracking, browser-side document
tools, document review, interview practice, and the deterministic attorney
handoff safety stop.

## Pre-Recording Setup

1. Start GreenPath locally from the repo root.

   ```bash
   PORT=5052 .venv/bin/python server.py
   ```

   If the live API is unreliable during recording, use deterministic demo mode:

   ```bash
   GREENPATH_DEMO=1 PORT=5052 .venv/bin/python server.py
   ```

2. Open `http://127.0.0.1:5052`.

3. Keep the browser on the app window only. Do **not** show `.env`, terminal
   history, the OpenAI key, GitHub secrets, or any private desktop content.

4. Set the browser zoom to `100%`, close extra tabs, hide the bookmarks bar, and
   use a clean 16:9 window.

5. Have these demo inputs ready in a scratch note for fast paste:

   ```text
   I am married to a U.S. citizen and we have lived together in the U.S. for 2 years. I entered on a tourist visa that has since expired. I have no criminal history. I do not have a U.S. job offer.
   ```

   ```text
   My biometrics appointment is on August 14, 2026. My interview is scheduled for October 2, 2026. USCIS says I must respond to the request for evidence by September 9, 2026.
   ```

   ```text
   Form: I-485
   Name: Maria Lopez
   Address history: current address only
   Entry status: B-2 visitor
   Last entry date: 2024-08-01
   Relationship: spouse of U.S. citizen
   Missing: vaccination record, I-864 sponsor income evidence, prior address for 2023
   ```

   ```text
   I overstayed a visa and I was arrested once. Can I still apply without a lawyer?
   ```

## Screen Studio Setup: Do This Exactly

### Browser Setup

1. Open only one browser window.
2. Go to `http://127.0.0.1:5052`.
3. Close every other tab.
4. Hide the bookmarks bar.
5. Set browser zoom to `100%`.
6. Make the browser window 16:9. Recommended size: `1440 x 810` or
   `1920 x 1080`.
7. Put the browser on the left/center of your monitor, with no desktop icons,
   terminal windows, notes, or private files visible behind it.
8. Start at the top hero section. The first frame should show:
   - centered `GreenPath` logo
   - headline `Green card prep, grounded.`
   - proof chips: `72/72 eval`, `281 tests`, `No account`, `Hard stop`
   - laptop-style route preview

### Screen Studio Capture Settings

Use these settings before pressing record:

| Setting | Exact Choice |
|---|---|
| Capture area | Browser window only |
| Aspect ratio | 16:9 |
| Export resolution | 1080p minimum |
| Frame rate | 30 FPS is enough; use 60 FPS only if your computer stays smooth |
| Cursor | Visible |
| Click effects | On |
| Cursor smoothing | On |
| Camera bubble | Optional; top-right only |
| Microphone | On |
| System audio | Off, unless demonstrating read-aloud |
| Auto zoom | On, but subtle |
| Captions | On if clean; remove if they cover the UI |
| Background blur | Off |

Camera bubble rule: if your face bubble covers the logo, a button, the result
panel, or the attorney-handoff modal, move it or turn it off. The app matters
more than the camera.

### Editing Rules

- Cut any loading wait longer than `1 second`.
- Keep scrolls slow and controlled. A scroll should last `1.0-1.5 seconds`,
  then stop for `2 seconds` so the viewer can read.
- Do not wiggle the cursor while speaking.
- After every important click, keep the cursor still for `1 second`.
- When a result appears, zoom in slightly and hold for `4-6 seconds`.
- Do not show `.env`, terminal history, API keys, GitHub settings, or private
  files.
- Do not open DevTools during the submitted video.
- Do not mention features you do not show on screen.
- Keep the final cut between `4:30` and `4:58`. Do not submit a video over
  `5:00`.

## Exact Screen Recording Directions

Follow this table while recording. The `Stay Here` column is the time you should
hold the screen still before moving again.

| Time | Where You Should Be | Exact Screen Studio / Browser Action | Stay Here | What Must Be Visible |
|---|---|---|---|---|
| Before 0:00 | Browser at top hero | Start recording. Wait silently for half a second before speaking. | 0.5 sec | Full hero, centered logo, headline, proof chips |
| 0:00-0:08 | Hero top | Keep cursor still near the headline. Do not move yet. | 8 sec | `Green card prep, grounded.` |
| 0:08-0:18 | Hero proof chips | Move cursor slowly across `72/72 eval`, `281 tests`, `No account`, `Hard stop`. Let Screen Studio auto-zoom once if it wants to. | 10 sec | All four proof chips |
| 0:18-0:26 | Hero route preview | Move cursor to the laptop-style route preview on the right. Do not click yet. | 8 sec | route preview / command cards |
| 0:26-0:33 | Navigation | Click the hero route card or menu item for `Find your pathway`. If clicking a nav menu, open the menu, click once, then stop moving. | 7 sec | transition into pathway section |
| 0:33-0:42 | Pathway Finder section | Stop when both the left text box and the right `Suggested Pathway` result panel are visible. | 9 sec | section title, input box, result panel |
| 0:42-0:50 | Pathway input | Click inside the text area. Select existing text if needed. Paste the prepared Maria input. | 8 sec | full or mostly visible pasted text |
| 0:50-0:55 | Pathway button | Move cursor to `Find my pathway`. Click it once. | 5 sec | `Find my pathway` button click |
| 0:55-1:08 | Pathway loading/result | Keep cursor still. If loading takes more than 1 second, cut the wait in editing. | 13 sec | result beginning to appear |
| 1:08-1:22 | Pathway result | Slight zoom on the right result panel. Hold long enough for category/next steps to be readable. | 14 sec | suggested category, next steps, safety language |
| 1:22-1:30 | Pathway trust note | Move cursor slowly to the `General info, not legal advice` strip. | 8 sec | trust strip |
| 1:30-1:36 | Navigation | Click or scroll to `Deadline alerts`. Use one smooth scroll or one menu click. | 6 sec | movement to deadlines |
| 1:36-1:44 | Deadline section | Stop with `Upcoming timeline`, the description box, and `Alert settings` visible. | 8 sec | `Extract Dates with AI` button |
| 1:44-1:53 | Deadline input | Click the deadline text box. Paste the prepared biometrics/interview/RFE deadline input. | 9 sec | pasted dates |
| 1:53-1:58 | Deadline button | Click `Extract Dates with AI`. | 5 sec | button click |
| 1:58-2:10 | Timeline result | Hold still. If loading is slow, cut the loading wait. | 12 sec | timeline items added |
| 2:10-2:19 | Timeline detail | Slight zoom on timeline cards. Move cursor slowly down the extracted dates. | 9 sec | multiple extracted dates |
| 2:19-2:26 | Navigation | Go to `Translate & read aloud`. | 7 sec | transition to language tools |
| 2:26-2:35 | Language tools top | Stop with translation input, language controls, scan/upload area, and read-aloud controls visible. | 9 sec | translation/read-aloud UI |
| 2:35-2:48 | Language privacy point | Move cursor to the browser-side scanning / read-aloud area and then to the trust text. Do not run a long audio demo. | 13 sec | scan/read-aloud controls and privacy language |
| 2:48-2:55 | Navigation | Go to `Review a form for issues`. | 7 sec | transition to document review |
| 2:55-3:04 | Document review section | Stop when the form input and `Possible issues to review` panel are both visible. | 9 sec | left input, right issue panel |
| 3:04-3:13 | Document input | Select the input text and paste the prepared I-485 sample. | 9 sec | pasted synthetic form details |
| 3:13-3:18 | Review button | Click `Review with AI`. | 5 sec | button click |
| 3:18-3:31 | Review result | Hold still while results appear. Cut any loading wait over 1 second. | 13 sec | issue list / severity / next steps |
| 3:31-3:40 | Review detail | Slight zoom on the issue list. Move cursor to one or two flagged issues only. | 9 sec | issues are readable |
| 3:40-3:47 | Navigation | Go to `Interview practice`. | 7 sec | transition to interview practice |
| 3:47-3:55 | Interview top | Stop with `Practice session`, example question, and `Start Practice` visible. | 8 sec | `Start Practice` button |
| 3:55-4:00 | Interview button | Click `Start Practice`. | 5 sec | first interview prompt |
| 4:00-4:08 | Interview coaching | If an answer field appears, type or paste: `I have lived at my current address since 2024 with my spouse.` Click `Send`. | 8 sec | interview chat area |
| 4:08-4:15 | Interview result | Hold on the coaching / next-question area. Cut if it loads slowly. | 7 sec | coaching or next question |
| 4:15-4:22 | Navigation | Go to `Stage Q&A`. | 7 sec | Q&A input |
| 4:22-4:31 | High-risk input | Select the Q&A input. Paste: `I overstayed a visa and I was arrested once. Can I still apply without a lawyer?` | 9 sec | high-risk text visible |
| 4:31-4:36 | Ask button | Click `Ask GreenPath`. | 5 sec | click before safety stop |
| 4:36-4:48 | Attorney handoff modal | Hold completely still. Slight zoom on the modal. Do not close it early. | 12 sec | attorney-handoff modal and reasons |
| 4:48-4:54 | Legal help | If time allows, click the legal-help action or show the legal-help links. If not, stay on the modal. | 6 sec | licensed/accredited help language |
| 4:54-4:58 | Closing frame | End on the modal or hero. Stop moving cursor. Finish narration. | 4 sec | safety stop or polished hero |

## Screen Studio Zoom Plan

Use only these zooms:

1. **0:08**: small zoom on proof chips. Hold `3 seconds`.
2. **1:08**: zoom on Pathway Finder result. Hold `6 seconds`.
3. **2:10**: zoom on deadline timeline. Hold `5 seconds`.
4. **3:31**: zoom on document-review issue list. Hold `5 seconds`.
5. **4:36**: zoom on attorney-handoff modal. Hold `8 seconds`.

Do not zoom during every scroll. Too much zooming makes the demo feel frantic.

## Scroll Rules

- Use the nav/menu for big jumps when possible.
- If you scroll manually, use one smooth trackpad gesture, then stop.
- Never scroll while reading a key result.
- Never scroll past a feature before the judge can understand what it does.
- If a section starts halfway down the screen, scroll back slightly until the
  section title and the main controls are visible together.

## If Something Goes Wrong During Recording

- If AI takes too long: stay calm, stop speaking for a beat, and cut the wait in
  Screen Studio.
- If the live API errors: restart with `GREENPATH_DEMO=1 PORT=5052
  .venv/bin/python server.py` and record again.
- If the attorney-handoff modal does not appear: use the exact high-risk input
  from this file and submit it in `Stage Q&A`.
- If scrolling looks choppy: record the browser window only, close other apps,
  disable camera bubble, and export at 30 FPS.
- If the video is over 5 minutes: cut the interview segment and keep the
  Pathway Finder, Deadline Alerts, Document Review, and Safety Stop.

## 5-Minute Script

| Time | Screen Action | Narration |
|---|---|---|
| 0:00-0:18 | Open on the GreenPath hero. Pause on the centered logo, headline, proof chips, and laptop-style layout. | "This is GreenPath: green card prep, grounded. The problem we are solving is that immigration information is scattered, high-stakes, and often written in language that is hard to understand. GreenPath turns that into a guided preparation workspace while staying clear that it is general information, not legal advice." |
| 0:18-0:38 | Slowly move cursor over the proof chips: `72/72 eval`, `281 tests`, `No account`, `Hard stop`. | "The important part is not just that it uses AI. The important part is that it has boundaries. Progress can stay in the browser, document scanning runs locally, and high-risk situations are stopped before the model can answer." |
| 0:38-1:18 | Go to `Find your pathway`. Paste the first demo input. Click `Find my pathway` or `Get pathway`. Let the result appear. | "First, an applicant describes their situation in plain English. In this example, Maria is married to a U.S. citizen, entered on a tourist visa, and does not know where to start. GreenPath suggests the likely category, explains why, and gives next steps in plain language. This is preparation guidance, not a case prediction." |
| 1:18-1:42 | Point to the result panel and any warning/help language. | "A normal chatbot would try to sound confident. GreenPath is designed to be useful without pretending to be a lawyer. The user gets a pathway, action steps, and reminders to verify official requirements or get authorized legal help for complex facts." |
| 1:42-2:18 | Go to `Deadline alerts`. Paste the deadline demo input. Click the deadline extraction/action button. Show the visual timeline. | "Next, GreenPath organizes deadlines. USCIS notices can hide important dates inside dense letters. Here, the app extracts biometrics, interview, and request-for-evidence dates into a timeline so the user knows what is coming next." |
| 2:18-2:52 | Go to `Translate & read aloud`. Show text entry, language selection, scan/upload area, and read-aloud controls. Do not wait on a long audio playback. | "GreenPath also supports people who are helping family members across language barriers. The app can translate text, scan documents in the browser, and read instructions aloud. The key privacy detail is visible in the product: image and PDF scanning happens in the browser, while AI text features clearly say what is sent to the server." |
| 2:52-3:25 | Go to `Review a form for issues`. Paste the form demo input. Click `Review with AI`. Show issue list and severity/next-step language. | "Before filing, users can paste form details and have GreenPath flag issues that commonly create confusion or requests for evidence, like missing address history, sponsor income evidence, or vaccination records. This does not replace legal review, but it helps people catch avoidable mistakes earlier." |
| 3:25-3:48 | Go to `Interview practice`. Type a short answer to a sample interview question, then show coaching/next question. | "GreenPath also helps users practice for the interview. It asks one question at a time and coaches the answer, so preparation feels less intimidating and more concrete." |
| 3:48-4:25 | Go to `Stage Q&A` or another AI input. Paste the high-risk input: `I overstayed a visa and I was arrested once...`. Submit it. Show the attorney-handoff modal. | "This is the most important part of the project. When the user mentions a high-risk situation, GreenPath does not generate an AI answer. The server runs a deterministic attorney-handoff check first. If that check fires, the model is never called. The user is routed to licensed or accredited help instead." |
| 4:25-4:45 | Go to `Legal notice & find help`. Show official-source language and legal aid links. | "That safety stop is backed by real help links and official-source framing. GreenPath is not trying to be an immigration lawyer. It is trying to help people prepare, understand, organize, and know when they need a professional." |
| 4:45-4:58 | End on hero or result panel. Keep cursor still. | "The current build has 281 passing tests and a deterministic evaluation score of 72 out of 72. Our goal is simple: make green card preparation more understandable, more accessible, and safer than asking an unrestricted chatbot." |

## One-Sentence Hook

Use this if the video needs a quick opening title card:

> GreenPath helps immigrants prepare for the green card process with grounded AI, deadline tracking, multilingual tools, and a hard safety stop when a real attorney is needed.

## What To Cut If You Are Running Long

- Cut the interview practice segment first.
- Keep the Pathway Finder, deadline timeline, and attorney-handoff safety stop.
- Never cut the safety stop. That is the strongest judging differentiator.

## Final Export Checklist

- The final video is under `5:00`.
- No API key, `.env`, private terminal, or personal desktop content appears.
- The GreenPath logo and main UI are visible in the first 5 seconds.
- The viewer sees a real user input, a real pathway result, a real deadline
  timeline, and the attorney-handoff modal.
- The closing line says `281 passing tests` and `72 out of 72 deterministic eval`
  only if those are still current in the repo at recording time.
