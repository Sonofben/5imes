// PM2 process file — `pm2 start ecosystem.config.js`
module.exports = {
  apps: [
    {
      name: "5ime",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3005",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "600M",
      env: { NODE_ENV: "production" },
    },
  ],
};
