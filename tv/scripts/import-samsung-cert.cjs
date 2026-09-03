#!/usr/bin/env node
// One-off: register the real Samsung-issued author+distributor
// certificates (created via the Tizen Extension's Certificate Manager,
// device-linked through a Samsung Account) as the active profile that
// deploy.cjs will use, replacing the generic Tizen SDK sample cert.
'use strict';

const path = require('path');
const os = require('os');
const { ProfileManager } = require('@tizentv/webide-common-tizentv');

const resourcePath = path.join(os.homedir(), 'tizen-studio-data', 'vscode-tizentv', 'resource');
// Note: this path must not contain spaces — the underlying library's
// macOS keychain command (`security add-generic-password -a ${pwdFile}`)
// doesn't quote this argument, so a space breaks it.
const CERT_DIR = '/Users/mikejs/SamsungCertificate/HomeDevelopment';
const PASSWORD = process.argv[2];
const PROFILE_NAME = 'home-development';

if (!PASSWORD) {
  console.error('Usage: node import-samsung-cert.cjs <password>');
  process.exit(1);
}

async function main() {
  const profileMgr = new ProfileManager(resourcePath);

  if (profileMgr.isProfileExist(PROFILE_NAME)) {
    profileMgr.removeProfile(PROFILE_NAME);
  }

  const authorProfile = {
    authorCA: '',
    authorCertPath: path.join(CERT_DIR, 'author.p12'),
    authorPassword: PASSWORD,
  };
  const distributorProfile = {
    distributorCA: '',
    distributorCertPath: path.join(CERT_DIR, 'distributor.p12'),
    distributorPassword: PASSWORD,
  };

  await profileMgr.registerProfile(PROFILE_NAME, authorProfile, distributorProfile);
  profileMgr.setActivateProfile(PROFILE_NAME);
  console.log(`Registered and activated profile "${PROFILE_NAME}"`);
}

main().catch((err) => {
  console.error('FAILED:', err.message || err);
  process.exit(1);
});
