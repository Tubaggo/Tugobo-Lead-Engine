/**
 * PM2 process definition for the Tugobo Lead Engine on the VPS.
 *
 * Single hard invariant: exactly one instance, fork mode. The operational-state
 * and Hermes-runtime write locks (`app/lib/operational-state/file-store.ts`) are
 * in-process only — a second instance, or cluster mode, can interleave writes
 * and lose data. See docs/HOSTINGER_DATA_STORAGE.md.
 *
 * `-H 127.0.0.1` binds Next below the reverse proxy. `next start` defaults to
 * 0.0.0.0 without this flag (verified against the installed Next 16.2.4 CLI),
 * so it is not optional — Nginx must be the only public entrypoint.
 *
 * No secrets here. Production values live in `.env.local` next to this file,
 * which Next.js loads automatically; PM2 only sets NODE_ENV.
 */

module.exports = {
  apps: [
    {
      name: "tugobo-lead-engine",
      cwd: "/opt/tugobo-lead-engine",
      script: "node_modules/.bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/tugobo-lead-engine/err.log",
      out_file: "/var/log/tugobo-lead-engine/out.log",
      time: true,
    },
  ],
};
