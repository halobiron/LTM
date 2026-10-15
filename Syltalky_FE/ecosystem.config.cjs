module.exports = {
  apps: [
    {
      name: 'syltalky-fe',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 5173 --host',
      cwd: __dirname,
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
