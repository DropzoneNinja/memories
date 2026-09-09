#!/usr/bin/env node
// npm's "version" lifecycle script (npm-version(1)): npm bumps this root
// package.json's version first, then runs this script before creating the
// release commit — it propagates that same version into api/, web/, and
// tv/'s package.json + package-lock.json, so a single `npm version` at the
// repo root keeps all three in lockstep, the same way every past release
// ("Release X.Y.Z", see git log) bumped them together by hand. npm stages
// whatever this script `git add`s into that same commit.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const newVersion = process.env.npm_new_version;
if (!newVersion) {
  throw new Error('sync-versions.mjs must run as npm\'s "version" lifecycle script (npm_new_version is unset)');
}

function updateJson(path, mutate) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  mutate(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  execFileSync('git', ['add', path]);
}

for (const pkg of ['api', 'web', 'tv']) {
  updateJson(`${pkg}/package.json`, (json) => {
    json.version = newVersion;
  });
  updateJson(`${pkg}/package-lock.json`, (json) => {
    json.version = newVersion;
    if (json.packages?.['']) json.packages[''].version = newVersion;
  });
}
