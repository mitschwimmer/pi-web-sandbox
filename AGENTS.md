# Pi Web Sandbox

Frontend source is in src/web and extensions/mirror-server.ts; reusable headless
runtime and tool policy are in service. Deployment-specific provisioning belongs
in the homelab repository.

Keep upstream attribution and record source updates in UPSTREAM.md.
In extension callbacks always refresh latestCtx. Long-lived timers, WebSocket
handlers, and async callbacks must use latestCtx rather than a captured ctx.
Never write stdout/stderr from extension code; use ctx.ui notification/status.
Forward Pi events unchanged; frontend code interprets their product meaning.
Do not add subprocess launches or automatically load writable workspace code.

Before publishing run npm run check, npm run build:web, npm test, and npm run bundle.
