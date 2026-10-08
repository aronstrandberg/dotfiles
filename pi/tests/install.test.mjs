import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const installer = fileURLToPath(new URL("../../pi.sh", import.meta.url));

const extensionSource = fileURLToPath(new URL("../extensions/", import.meta.url));

test("repeated installs outside the repo preserve credentials, local preferences, and generated extensions", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-dotfiles-"));

  try {
    const agent = join(home, ".pi/agent");
    await mkdir(join(agent, "extensions"), { recursive: true });
    await writeFile(
      join(agent, "settings.json"),
      JSON.stringify({ deviceId: "local-device", defaultModel: "old-model", customSetting: true }),
    );
    await writeFile(join(agent, "auth.json"), "private");
    await writeFile(join(agent, "extensions/herdr-agent-state.ts"), "managed");

    for (let count = 0; count < 2; count++)
      execFileSync("sh", [installer], { cwd: tmpdir(), env: { ...process.env, HOME: home } });

    const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));

    assert.equal(settings.defaultModel, "gpt-6.1-sol");
    assert.equal(settings.defaultThinkingLevel, "high");
    assert.equal(settings.deviceId, "local-device");
    assert.equal(settings.customSetting, true);
    assert.equal(await readFile(join(agent, "auth.json"), "utf8"), "private");
    assert.equal(await readFile(join(agent, "extensions/herdr-agent-state.ts"), "utf8"), "managed");

    for (const name of ["footer-padding.ts", "ask-questions.ts"])
      assert.equal(
        await readFile(join(agent, "extensions", name), "utf8"),
        await readFile(join(extensionSource, name), "utf8"),
      );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
