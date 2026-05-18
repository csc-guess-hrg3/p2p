module.exports = {
  apps: [
    {
      name: 'p2p-api',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      max_memory_restart: '512M',
      restart_delay: 3000,
    },
  ],
};
