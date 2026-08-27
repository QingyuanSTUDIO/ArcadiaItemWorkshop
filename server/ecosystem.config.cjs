module.exports = {
  apps: [{
    name: 'arcadia-item-workshop',
    script: './src/server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8787,
    },
  }],
};
