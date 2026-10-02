#!/bin/sh
set -eu
mkdir -p release
test -f dist/index.html
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -czf release/pi-web-sandbox.tgz \
  package.json package-lock.json service extensions/mirror-server.ts dist README.md UPSTREAM.md
(cd release && sha256sum pi-web-sandbox.tgz > pi-web-sandbox.tgz.sha256)
