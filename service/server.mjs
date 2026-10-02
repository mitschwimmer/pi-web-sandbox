import { fileURLToPath } from "node:url";
import {
  createAgentSession, createCodemodeExtension, createToolSearchExtension,
  DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";

export const tools = ["read", "edit", "write", "grep", "find", "ls", "codemode", "tool_search"];

export async function startPi({ cwd, agentDir, sessionDir, origin, host = "127.0.0.1", port = 3001, provider, model,
  extensionPath = fileURLToPath(new URL("../extensions/mirror-server.ts", import.meta.url)) }) {
  const publicUrl = new URL(origin);
  if (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.origin !== origin) {
    throw new Error("Origin must be an HTTP(S) origin without a path or credentials");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535");
  Object.assign(process.env, {
    PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir,
    PI_WEB_UI_ORIGIN: origin, PI_WEB_UI_HOST: host, PI_WEB_UI_PORT: String(port),
  });
  // Configuration and code belong to the operator. Never load executable
  // extensions or command-based credentials from the writable workspace.
  const settingsManager = SettingsManager.inMemory({
    ...(provider ? { defaultProvider: provider } : {}),
    ...(model ? { defaultModel: model } : {}), defaultThinkingLevel: "medium",
    defaultTools: tools, defaultProjectTrust: "never",
    compaction: { enabled: true, reserveTokens: 10000, keepRecentTokens: 12000 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [extensionPath],
    extensionFactories: [createCodemodeExtension(), createToolSearchExtension()],
    noSkills: true, noPromptTemplates: true, noThemes: true,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create({
    modelsPath: `${agentDir}/models.json`,
    // Provider credentials come from operator-owned models.json (including
    // environment references). The service does not write interactive auth or
    // catalog files into that configuration directory.
    credentials: {
      read: async () => undefined, list: async () => [],
      modify: async () => { throw new Error("Configure providers through the deployment"); },
      delete: async () => { throw new Error("Configure providers through the deployment"); },
    },
    modelsStore: { read: async () => undefined, write: async () => {}, delete: async () => {} },
    allowModelNetwork: false,
  });
  const { session, extensionsResult } = await createAgentSession({
    cwd, agentDir, settingsManager, resourceLoader, modelRuntime,
    tools, excludeTools: ["bash"],
    sessionManager: SessionManager.continueRecent(cwd, sessionDir),
  });
  if (extensionsResult.errors.length) {
    session.dispose();
    throw new Error(JSON.stringify(extensionsResult.errors));
  }
  await session.bindExtensions({
    mode: "rpc",
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
      navigateTree: (id, options) => session.navigateTree(id, options),
    },
  });
  // Capture command context for conversation-tree navigation without a TUI.
  await session.prompt("/webui");
  return session;
}

export async function stopPi(session) {
  await session.abort();
  await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
  session.dispose();
}
