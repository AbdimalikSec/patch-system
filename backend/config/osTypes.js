// Central list of recognized OS families. Adding real support for a new one
// (e.g. "macos") means: add it here, add a matching branch in deploy.js's
// deployOnePackage(), and write a matching enrollment-script template in
// machines.js — this file alone doesn't make patching work, it just stops
// the OS value itself from being rejected at the schema/validation level.
const SUPPORTED_OS = ["windows", "linux"];

module.exports = { SUPPORTED_OS };
