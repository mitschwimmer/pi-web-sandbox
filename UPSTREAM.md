# Upstream provenance

The frontend is a source fork of https://github.com/kkkiio/pi-web-ui at
`a3ab3b1c46f0ad3d837d7ba9e968b7e61d5259da`, the source of
`@kkkiio/pi-web-ui@0.1.1`. Upstream declares the MIT license and credits kkkiio.
The original source, design records, and screenshots are retained.

Local changes remove process-launching desktop features, enforce the configured
HTTP/WebSocket origin, and provide a headless SDK service with an explicit tool
policy. There is no install-time source patch. To update upstream, compare source
changes against the recorded commit and rerun the build and integration tests.

Pi itself is the separately versioned `@earendil-works/pi-coding-agent@1.0.0`
dependency. Its source and license are distributed by that package.
