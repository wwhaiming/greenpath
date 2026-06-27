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

## Screen Studio Settings

- Record the browser window, not the full desktop.
- Use 16:9 export, preferably `1920 x 1080` or higher.
- Put camera bubble in the top-right only if it does not cover the GreenPath
  logo, results panel, or safety modal.
- Turn on smooth cursor and click highlights.
- Keep Screen Studio auto-zoom subtle: zoom into buttons and result panels, but
  avoid constant zooming while scrolling.
- Cut out loading waits longer than 1 second. Keep the final video fast.
- Add captions only for the spoken narration. Do not add feature labels that are
  not visible in the app.
- If using text-to-speech read-aloud, keep system audio low under narration.
- Export as MP4, 1080p, high quality.

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
