// EL-SDK: Electron app plus a background Host service (ADES.md 3.5).
import { click, pause, waitForText } from "./macos.ts";
import { profileAdapter } from "./profile.ts";

// The Start Page composer takes keys about 300 ms after cmd+n, and A4 types right after newThread(). The wait lives here
// and not in timed.newThread, because A3 times those triggers.
const COMPOSER_READY_MS = 800;

// Checked 2026-11-07 on 1.5.3: when a turn's items arrive faster than the Task view scrolls (long-2000 writes 2,000 at
// once), the view stops following the end, stays near step 60 to 140 and shows a "New Reply" button above the composer.
// A tab keeps that position, so A11's open never saw LONGTHREAD-END. A click on the button jumps to the end, and the tab
// then reopens there. The button shows only when the view is away from the end, so the click is made only when OCR sees
// it: a blind click would take the focus from the composer that send() pastes into.
const NEW_REPLY_REGION = { x: 880, y: 720, w: 240, h: 52 };
const NEW_REPLY_POINT = { x: 988, y: 746 };
const NEW_REPLY_TRIES = 3;
const NEW_REPLY_WATCH_S = 3;
const NEW_REPLY_SETTLE_MS = 1500;

// A11 "long thread not built" on the nights of 10 Nov (1.5.3, control-2026-11-10T08-31-19Z-traycer-2) and 22 Nov
// (1.5.4, control-2026-11-22T09-46-47Z-traycer-1): the session log of long-2000 ended while Traycer still showed the
// turn as running. The view had stopped following near step 15 to 64, and the button above the composer read its
// working verb ("Distilling…", "Tinkering…", at about 1000,746 in waits/*-New-Reply.png), not "New Reply", so the 3 s
// check after the turn found nothing. About 30 s into the drain watch the button turned into "New Reply"
// (frames-drain.json: every frame after 29.9 s reads it in threadRect on 1.5.4, "New RepFy -" after 30.5 s on 1.5.3),
// nobody clicked it, and THREAD-END never showed in 420 s. The renderer proves it is one button (aria-label "Scroll to
// end", renderer/assets/index-CN45YtCZ.js): it reads the working verb while the turn runs, "New Reply" once the turn has
// ended unseen, and "Jump to Latest" otherwise, and every click scrolls to the end. OCR does not read the verb pill on
// 1.5.4, so after the long prompt the wait goes on until the end marker or "New Reply" shows in threadRect, and the
// button is clicked when "New Reply" is there. The wait is setup: nothing times it.
const LONG_PROMPT = "replay:long-2000";
const LONG_END = "THREAD-END";
const NEW_REPLY_TEXTS = ["New Reply", "New RepFy"];
const LONG_SETTLE_S = 240;
const NEW_REPLY_CHECK_S = 2;

export const traycer = profileAdapter({
  id: "traycer",
  name: "Traycer",
  family: "EL-SDK",
  agents: ["claude", "codex"],
  // ADES.md 3.5: "open -a with the app name read at install (not installed yet)".
  appName: "Traycer",
  // ADES.md 3.5: bundle id not stated; read it from the installed bundle.
  bundleId: null,
  // ADES.md 3.5: drive is the `traycer` CLI and CDP.
  drive: "cli",
  // ADES.md 3.5: "Data to move aside | ~/.traycer/ (chats, credentials, host/host.log, worktrees/, epics/<task-id>)".
  dataDirs: ["~/.traycer"],
  // ADES.md 3.5: the Host service keeps running after quit; its launch-agent label is unknown.
  launchAgents: [],
  // ADES.md 3.5: Electron set plus the Host service, which survives quit.
  vendorDirs: ["~/.traycer"],
});

const openThread = traycer.newThread;
traycer.newThread = async (ctx) => {
  await openThread(ctx);
  await pause(ctx, COMPOSER_READY_MS);
};

let appPid = 0;
const launchApp = traycer.launch;
traycer.launch = async (ctx) => {
  const launched = await launchApp(ctx);
  appPid = launched.pid;
  return launched;
};

let lastPrompt = "";
const sendPrompt = traycer.send;
traycer.send = async (ctx, text) => {
  lastPrompt = text;
  await sendPrompt(ctx, text);
};

const waitTurn = traycer.waitDone;
traycer.waitDone = async (ctx, timeoutMs) => {
  const result = await waitTurn(ctx, timeoutMs);
  if (!result.done || appPid === 0) return result;
  const threadRect = traycer.calibration.threadRect;
  if (lastPrompt === LONG_PROMPT && threadRect !== null) {
    await waitForText(ctx, appPid, threadRect, [LONG_END, ...NEW_REPLY_TEXTS], LONG_SETTLE_S, { optional: true });
    if (await waitForText(ctx, appPid, threadRect, NEW_REPLY_TEXTS, NEW_REPLY_CHECK_S, { optional: true })) {
      await click(ctx, appPid, NEW_REPLY_POINT);
      await pause(ctx, NEW_REPLY_SETTLE_MS);
    }
  }
  for (let tries = 0; tries < NEW_REPLY_TRIES; tries++) {
    try {
      await waitForText(ctx, appPid, NEW_REPLY_REGION, "New Reply", NEW_REPLY_WATCH_S);
      await click(ctx, appPid, NEW_REPLY_POINT);
    } catch {
      break;
    }
    await pause(ctx, NEW_REPLY_SETTLE_MS);
  }
  return result;
};
