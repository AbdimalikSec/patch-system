module.exports = {
  apps: [{
    name: "riskpatch-backend",
    script: "server.js",
    cwd: "/opt/risk-patch-system/patch-system/backend",
    env: { NODE_ENV: "production" }
  }]
};