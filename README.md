# Pi Web Sandbox

A source fork of [kkkiio/pi-web-ui](https://github.com/kkkiio/pi-web-ui) with a
headless Pi service. VM provisioning, reverse proxy, authentication, and model
endpoint configuration belong to the deployment repository.

The service enables Pi's Linux built-ins: read, edit, write, grep, find, ls,
codemode, and tool_search. Bash is excluded and cannot be reactivated through the
frontend. Workspace extensions, skills, prompts, and themes are not auto-loaded.
The frontend does not launch browsers, native applications, terminals, or export
subprocesses. HTTP and WebSocket requests enforce the configured public origin.

This is one shared workspace and conversation service. Put it behind an
authenticated reverse proxy; it does not implement user accounts. The service can
access the network. CodeMode and file tools remain powerful: run as an
unprivileged user in a dedicated VM, keep executable code and configuration
read-only, and grant write access only to workspace/session storage.

## Run

Requires Node 24.19.0 or newer, ripgrep, and fd (`fdfind` can be linked as `fd`).
Build from source:

```sh
npm ci --ignore-scripts
npm run build:web
npm start -- --workspace /workspace --config-dir /etc/pi-web-sandbox \
  --sessions-dir /var/lib/pi/sessions --origin https://pi.example.com \
  --host 0.0.0.0 --port 3001 --provider homelab --model MODEL_ID
```

Place an operator-owned Pi `models.json` in the configuration directory. Provider
credentials can use Pi's environment references. Interactive credential writes
are disabled. `node service/cli.mjs --help` lists equivalent environment settings.
Keep configuration outside the writable workspace. Sessions resume from the
sessions directory after a restart.

## Releases and deployment

Each verified push to main publishes `build-COMMIT_SHA` with
`pi-web-sandbox.tgz` and its SHA-256 file. The archive contains built frontend
assets, service source, and the dependency lockfile. Download a specific release,
verify its checksum, extract it, and run `npm ci --omit=dev --ignore-scripts`.
Do not build frontend assets on the service host. Pin both release and checksum
in the deployment repository; upgrades are explicit deployment changes.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run build:web
npm test
npm run bundle
```

Integration tests use a local fake model and check headless conversations, all
enabled tools, disabled Bash, origin rejection, and workspace extension isolation.
See [UPSTREAM.md](UPSTREAM.md) for the upstream source and update procedure.
