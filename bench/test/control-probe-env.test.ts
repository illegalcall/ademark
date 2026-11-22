// The Claude probe of Control (bench/control/real.ts claudeAnswers) must reach the real API even when a cut block left
// Superset's replay URL in ~/.claude/settings.json (council review, 22 Nov 2026).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetMacosRunner, setMacosRunner } from "../adapters/macos.ts";
import { clearReplayEnvForProbe } from "../control/real.ts";
import { fakeRunner } from "./adapters-fake.ts";

let home: string;
const settings = (): string => join(home, ".claude", "settings.json");
const write = (data: unknown): void => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(settings(), JSON.stringify(data), { mode: 0o600 });
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ademark-probe-env-"));
});
afterEach(() => {
  resetMacosRunner();
  rmSync(home, { recursive: true, force: true });
});

describe("clearReplayEnvForProbe", () => {
  test("removes a leftover replay URL and keeps every other key", () => {
    setMacosRunner(fakeRunner("ademark"));
    write({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8787", DISABLE_AUTOUPDATER: "1" }, theme: "dark" });
    clearReplayEnvForProbe(home);
    const data = JSON.parse(readFileSync(settings(), "utf8")) as { env: Record<string, string>; theme: string };
    expect(data.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(data.env.DISABLE_AUTOUPDATER).toBe("1");
    expect(data.theme).toBe("dark");
  });

  test("outside the ademark user it changes nothing and does not throw", () => {
    setMacosRunner(fakeRunner("someone"));
    write({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8787" } });
    const lines: string[] = [];
    clearReplayEnvForProbe(home, (line) => lines.push(line));
    expect(JSON.parse(readFileSync(settings(), "utf8")).env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:8787");
    expect(lines.join("\n")).toContain("not cleared");
  });
});
