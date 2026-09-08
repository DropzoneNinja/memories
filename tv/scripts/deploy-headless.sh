#!/bin/bash
# Wraps `npm run deploy` for headless Linux deploy hosts (no desktop
# session — e.g. a server reached only over SSH). Tizen's certificate
# signing shells out to `secret-tool` (libsecret) to store/retrieve the
# cert password via the Linux Secret Service D-Bus API, normally backed
# by a keyring daemon started as part of a desktop login — headless has
# neither, so plain `npm run deploy` fails with "Failed to store/get
# password... not supported in headless Linux system."
#
# This spins up a throwaway D-Bus session with an unlocked gnome-keyring
# for the duration of one deploy — verified working end-to-end (cert
# creation, signing, sdb install/launch) against a real TV, see
# INSTALLATION.md's Troubleshooting entry. Requires `gnome-keyring` and
# `libsecret-tools` installed (apt-get install gnome-keyring
# libsecret-tools on Debian/Ubuntu). Not needed on macOS (Keychain) or
# any machine with a real desktop session — use `npm run deploy` there.
#
# Usage: npm run deploy:headless -- [tvIp] [serverUrl]  (same args as deploy)
set -e
exec dbus-run-session -- bash -c '
  eval "$(printf "\n" | gnome-keyring-daemon --unlock --components=pkcs11,secrets)"
  exec npm run deploy "$@"
' _ "$@"
