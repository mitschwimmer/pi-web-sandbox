#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startPi, stopPi } from "./server.mjs";

const { values } = parseArgs({ options: {
  workspace: { type: "string", default: process.env.PI_WORKSPACE ?? process.cwd() },
  "config-dir": { type: "string", default: process.env.PI_CONFIG_DIR ?? "/etc/pi-web-sandbox" },
  "sessions-dir": { type: "string", default: process.env.PI_SESSION_DIR ?? "/var/lib/pi/sessions" },
  origin: { type: "string", default: process.env.PI_WEB_UI_ORIGIN },
  host: { type: "string", default: process.env.PI_WEB_UI_HOST ?? "127.0.0.1" },
  port: { type: "string", default: process.env.PI_WEB_UI_PORT ?? "3001" },
  provider: { type: "string", default: process.env.PI_PROVIDER },
  model: { type: "string", default: process.env.PI_MODEL_ID },
  help: { type: "boolean", short: "h" },
} });
if (values.help) {
  console.log(`pi-web-sandbox --origin https://pi.example.org [options]
  --workspace PATH       Working files (default: current directory)
  --config-dir PATH      Operator-owned models.json (default: /etc/pi-web-sandbox)
  --sessions-dir PATH    Persistent sessions (default: /var/lib/pi/sessions)
  --host ADDRESS         Bind address (default: 127.0.0.1)
  --port NUMBER          HTTP/WebSocket port (default: 3001)
  --provider NAME        Initial model provider (default: automatic)
  --model ID             Initial model ID (default: automatic)`);
  process.exit(0);
}
if (!values.origin) throw new Error("--origin or PI_WEB_UI_ORIGIN is required");
const cwd = resolve(values.workspace);
const sessionDir = resolve(values["sessions-dir"]);
await mkdir(cwd, { recursive: true });
await mkdir(sessionDir, { recursive: true });
const session = await startPi({
  cwd, agentDir: resolve(values["config-dir"]), sessionDir,
  origin: values.origin, host: values.host, port: Number(values.port),
  provider: values.provider, model: values.model,
});
console.log("Pi ready; tools:", session.getActiveToolNames().join(", "));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, async () => { await stopPi(session); process.exit(0); });
}
