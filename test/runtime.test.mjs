import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WebSocket } from "ws";
import { startPi, stopPi, tools } from "../service/server.mjs";

const extensionPath = fileURLToPath(new URL("../extensions/mirror-server.ts", import.meta.url));
const origin = "https://pi.example.test";
async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

test("frontend source has no subprocess access", async () => {
  assert.doesNotMatch(await readFile(extensionPath, "utf8"), /node:child_process|execSync/);
});

test("headless Pi keeps Bash excluded and serves only the hardened frontend", { timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "homelab-pi-"));
  const workspace = join(dir, "workspace");
  const agentDir = join(dir, "config");
  const sessionDir = join(dir, "sessions");
  await Promise.all([workspace, agentDir, sessionDir].map(path => mkdir(path)));
  // Even workspace configuration asking for Bash and an executable extension
  // must not alter this service's deployment-controlled resource selection.
  await mkdir(join(workspace, ".pi", "extensions"), { recursive: true });
  await writeFile(join(workspace, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["bash"] }));
  await writeFile(join(workspace, ".pi", "extensions", "evil.ts"), 'throw new Error("workspace extension loaded");');
  let toolResult;
  const script = `
    await tools.write({path: "sample.txt", content: "before\\n"});
    await tools.edit({path: "sample.txt", oldText: "before", newText: "after"});
    const read = await tools.read({path: "sample.txt"});
    const grep = await tools.grep({pattern: "after", path: "."});
    const find = await tools.find({pattern: "*.txt", path: "."});
    const ls = await tools.ls({path: "."});
    return {read, grep, find, ls, bash: "bash" in tools};
  `;
  const backend = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(request.tools.some(tool => tool.function.name === "bash"), false);
    const last = request.messages.at(-1);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
      id: "chatcmpl-test", object: "chat.completion.chunk", created: 1, model: "homelab",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    if (last.role === "tool") {
      toolResult = last.content;
      send({ role: "assistant", content: "Verified." });
      send({}, "stop");
    } else {
      send({ role: "assistant", tool_calls: [{ index: 0, id: "call_test", type: "function", function: { name: "codemode", arguments: JSON.stringify({ code: script }) } }] });
      send({}, "tool_calls");
    }
    res.end("data: [DONE]\n\n");
  });
  const modelPort = await listen(backend);
  const reserve = createServer();
  const webPort = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { homelab: {
    api: "openai-completions", apiKey: "test", baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    models: [{ id: "homelab", contextWindow: 49152, maxTokens: 8192 }],
  } } }));
  Object.assign(process.env, {
    PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir,
    PI_WEB_UI_HOST: "127.0.0.1", PI_WEB_UI_PORT: String(webPort), PI_WEB_UI_ORIGIN: origin,
  });
  t.after(async () => {
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const session = await startPi({ cwd: workspace, agentDir, sessionDir, extensionPath, origin, port: webPort });
  t.after(() => stopPi(session));
  assert.deepEqual(new Set(session.getActiveToolNames()), new Set(tools));
  session.setActiveToolsByName([...tools, "bash"]);
  assert.equal(session.getActiveToolNames().includes("bash"), false);
  await session.prompt("Verify tools through Code Mode.");
  assert.equal(await readFile(join(workspace, "sample.txt"), "utf8"), "after\n");
  assert.match(toolResult, /after/);
  assert.match(toolResult, /sample.txt/);
  assert.match(toolResult, /"bash":\s*false/);
  assert.equal(session.getLastAssistantText(), "Verified.");

  const base = `http://127.0.0.1:${webPort}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(`${base}/api/health`, { headers: { origin: "https://untrusted.test" } })).status, 403);
  for (const route of ["/api/projects/launch", "/api/open"]) {
    assert.equal((await fetch(base + route, { method: "POST", headers: { origin }, body: "{}" })).status, 404);
  }
  const exported = await fetch(`${base}/api/rpc`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ type: "export_html", outputPath: '$(touch /tmp/escape)' }),
  });
  assert.equal((await exported.json()).success, false);
  const denied = new WebSocket(`ws://127.0.0.1:${webPort}/ws`, { origin: "https://untrusted.test" });
  await new Promise(resolve => { denied.on("error", resolve); });
  const ws = new WebSocket(`ws://127.0.0.1:${webPort}/ws`, { origin });
  t.after(() => ws.terminate());
  const state = await new Promise((resolve, reject) => {
    ws.on("error", reject);
    ws.on("message", data => {
      const event = JSON.parse(String(data));
      if (event.type === "mirror_sync") resolve(event);
    });
  });
  assert.ok(state.entries.length > 0);
  assert.ok(state.entries.some(entry => entry.message?.role === "assistant"));
});
