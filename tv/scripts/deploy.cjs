#!/usr/bin/env node
// Build, sign, and install the Memories TV app on a real Tizen TV — the
// scriptable equivalent of the "Tizen TV" VS Code extension's Certificate
// Manager -> Build Signed Package -> Launch Application commands, using
// the same underlying (vscode-free) @tizentv/* libraries as a real
// devDependency instead of reaching into an editor's extension folder.
//
// Usage: npm run deploy [tvIp] [serverUrl]
//   tvIp defaults to $MEMORIES_TV_IP, then 10.10.10.80.
//   serverUrl is the Memories API this build should point at (baked in at
//   build time as VITE_MEMORIES_API_URL, main.ts) — when given, it's saved
//   to tv/.env so every future build/deploy reuses it automatically; when
//   omitted, whatever's already in tv/.env (gitignored, local to this
//   machine) is reused as-is. Pass an empty string for tvIp to update just
//   the server URL while keeping the default TV IP: `npm run deploy ''
//   https://memories.example.com`. This script always rebuilds
//   (`npm run build`) so a freshly-saved URL is never stale.
//
// IMPORTANT — known limitation (see PROJECT.md / TASKS.md Phase 0):
// on first run this mints a generic Tizen SDK sample certificate. That is
// enough to build a validly-*structured* signed package, but genuine
// retail Samsung TVs additionally require a Samsung-issued, device-ID-
// linked distributor certificate (obtained via a Samsung Account) before
// `vd_appinstall` will actually accept the package — without it you'll
// see: "install failed[118, -12], reason: Check certificate error :
// Invalid certificate chain with certificate in signature." Once that
// Samsung certificate exists (as a .p12), register it as the active
// profile's distributor2 slot and re-run this script — everything else
// here already works end-to-end.
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const { TizenCertManager, ProfileManager } = require('@tizentv/webide-common-tizentv');
const TVWebApp = require('@tizentv/webide-common-tizentv/lib/projectHelper');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIST = path.join(PROJECT_ROOT, 'dist');
const TV_IP = process.argv[2] || process.env.MEMORIES_TV_IP || '10.10.10.80';

// Where the build-time API URL lives (tv/.env, gitignored — Vite loads it
// automatically on every `vite build`/`vite dev`, no extra wiring needed).
// Reading/writing it here is what makes the server URL "remembered between
// updates" from the operator's side: this file lives on the dev machine,
// not the TV, so it survives every redeploy regardless of what happens to
// the TV's own localStorage (which does NOT survive — see this script's
// uninstall-then-reinstall behaviour below, and TASKS.md's Phase 3 note).
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const ENV_KEY = 'VITE_MEMORIES_API_URL';

function readServerUrl() {
  if (!fs.existsSync(ENV_PATH)) return null;
  const match = fs.readFileSync(ENV_PATH, 'utf-8').match(new RegExp(`^${ENV_KEY}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function writeServerUrl(url) {
  const line = `${ENV_KEY}=${url}`;
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const pattern = new RegExp(`^${ENV_KEY}=.*$`, 'm');
  const updated = pattern.test(existing) ? existing.replace(pattern, line) : `${existing.trimEnd()}\n${line}`.trimStart();
  fs.writeFileSync(ENV_PATH, updated.endsWith('\n') ? updated : `${updated}\n`);
}

// Resolves which server URL this build should use, saving a newly-given
// one for next time. Throws on an obviously malformed value rather than
// silently baking in a typo that would only surface later as a mysterious
// "TV never pairs" report.
function resolveServerUrl() {
  const givenArg = process.argv[3];
  if (givenArg) {
    if (!/^https?:\/\//.test(givenArg)) {
      throw new Error(`serverUrl must start with http:// or https:// — got "${givenArg}"`);
    }
    writeServerUrl(givenArg);
    console.log(`[config] saved server URL for future builds: ${givenArg}`);
    return givenArg;
  }

  const remembered = readServerUrl();
  if (remembered) {
    console.log(`[config] reusing last configured server URL: ${remembered}`);
    return remembered;
  }

  console.log('[config] no server URL configured yet — pass one: npm run deploy [tvIp] <serverUrl>');
  return null;
}

const resourcePath = path.join(os.homedir(), 'tizen-studio-data', 'vscode-tizentv', 'resource');
const profilePath = path.join(resourcePath, 'profiles.xml');

const EMPTY_PROFILES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<profiles active="" version="3.1">\n</profiles>\n`;

const DEFAULT_PROFILE_NAME = 'memories';

async function ensureProfile() {
  fs.mkdirSync(resourcePath, { recursive: true });
  fs.mkdirSync(path.join(resourcePath, 'Author'), { recursive: true });
  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, EMPTY_PROFILES_XML);
  }

  const profileMgr = new ProfileManager(resourcePath);

  // Reuse whatever profile is already active (e.g. one built around a
  // real Samsung distributor cert) rather than clobbering it.
  const { getActiveProfile } = require('@tizentv/webide-common-tizentv/lib/profileEditor');
  const active = getActiveProfile(profilePath);
  if (active) {
    console.log(`[cert] reusing active profile "${active}"`);
    return;
  }

  console.log('[cert] no active profile yet — creating a generic Tizen SDK sample cert (see script header re: real-TV limitation)...');
  const tizenCertMgr = new TizenCertManager(resourcePath);
  await tizenCertMgr.init();

  // The extension's bundled default "sdk-public" distributor cert expired
  // 2022-10-27; Samsung ships renewed "-new" files alongside it in the
  // same download. Use those instead.
  tizenCertMgr.distributorPublicCA = tizenCertMgr.distributorPublicCA.replace(
    'tizen-distributor-ca.cer',
    'tizen-distributor-ca-new.cer',
  );
  tizenCertMgr.distributorPublicSigner = tizenCertMgr.distributorPublicSigner.replace(
    'tizen-distributor-signer.p12',
    'tizen-distributor-signer-new.p12',
  );

  const keyFileName = 'memories_author';
  const authorPassword = crypto.randomBytes(9).toString('hex');

  tizenCertMgr.createCert({
    keyFileName,
    authorName: 'Memories Dev',
    authorPassword,
    countryInfo: '',
    stateInfo: '',
    cityInfo: '',
    organizationInfo: '',
    departmentInfo: '',
    emailInfo: '',
  });

  const keyFilePath = path.join(resourcePath, 'Author', `${keyFileName}.p12`);
  const authorProfile = {
    authorCA: tizenCertMgr.getTizenDeveloperCA(),
    authorCertPath: keyFilePath,
    authorPassword,
  };
  const distributorProfile = tizenCertMgr.getTizenDistributorProfile('public');
  await profileMgr.registerProfile(DEFAULT_PROFILE_NAME, authorProfile, distributorProfile);
  profileMgr.setActivateProfile(DEFAULT_PROFILE_NAME);
  console.log(`[cert] created and activated profile "${DEFAULT_PROFILE_NAME}"`);
}

async function main() {
  resolveServerUrl();

  await ensureProfile();

  console.log('[build] building the app (npm run build)...');
  execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (!fs.existsSync(path.join(PROJECT_DIST, 'config.xml'))) {
    throw new Error(`Build did not produce ${PROJECT_DIST}/config.xml`);
  }

  console.log(`[build] signing widget from ${PROJECT_DIST}...`);
  const webApp = TVWebApp.openProject(PROJECT_DIST);
  if (!webApp) throw new Error(`Invalid config.xml at ${PROJECT_DIST}`);
  await webApp.buildWidget(profilePath, null);
  console.log(`[build] -> ${path.join(PROJECT_DIST, `${webApp.appName}.wgt`)}`);

  console.log(`[deploy] connecting to ${TV_IP}, installing, launching...`);
  await webApp.launchOnTV(TV_IP, null, false, null);
  console.log('[deploy] done. If this TV lacks a Samsung-signed distributor cert, check the install actually succeeded (this step does not verify install output) — see script header.');
}

main().catch((err) => {
  console.error('FAILED:', err.message || err);
  process.exit(1);
});
