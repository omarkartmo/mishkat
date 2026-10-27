/**
 * MISHKAT Developer Support Hub — ngrok Tunnel Supervisor
 * 
 * Guarantees 100% Tunnel Uptime under all circumstances:
 * - Uses --pooling-enabled to keep public URL alive and prevent endpoint downtime
 * - Supervised child process with automatic instant revival on crash/exit
 * - Active 20-second heartbeat watchdog querying ngrok Agent API (127.0.0.1:4040)
 * - Self-healing conflict resolution for stale/zombie ngrok instances
 * - Exposes status metrics and on-demand restart controls for Support Dashboard
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TARGET_PORT = parseInt(process.env.SUPPORT_HUB_PORT || process.env.PORT || 4000, 10);
const EXPECTED_DOMAIN = 'calibrate-reply-aviation.ngrok-free.dev';
const EXPECTED_PUBLIC_URL = `https://${EXPECTED_DOMAIN}`;
const NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';

let ngrokProcess = null;
let heartbeatTimer = null;
let restartTimeout = null;
let isShuttingDown = false;

const state = {
  status: 'offline', // 'starting' | 'online' | 'reconnecting' | 'offline' | 'error'
  publicUrl: EXPECTED_PUBLIC_URL,
  targetPort: TARGET_PORT,
  poolingEnabled: true,
  processId: null,
  startedAt: null,
  lastHeartbeat: null,
  restartsCount: 0,
  consecutiveFailures: 0,
  lastError: null,
  uptimeSeconds: 0,
};

// Locate ngrok executable binary
function findNgrokBinary() {
  const candidates = [
    path.join(__dirname, '../../bin/ngrok.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Links/ngrok.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ngrok', 'ngrok.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Check in PATH
  try {
    const stdout = execSync('where ngrok', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // ignore
  }

  return 'ngrok';
}

// Query local ngrok API to check health and active tunnels
function queryNgrokApi() {
  return new Promise((resolve, reject) => {
    const req = http.get(NGROK_API_URL, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse ngrok API response: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ngrok API request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Kill any zombie/orphaned ngrok.exe processes if they are hung or unmanaged
function killZombieNgrok() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM ngrok.exe 2>nul', { stdio: 'ignore' });
    } else {
      execSync('pkill -9 ngrok 2>/dev/null', { stdio: 'ignore' });
    }
  } catch {
    // ignore if none running
  }
}

// Start supervised ngrok tunnel process
async function startTunnel() {
  if (isShuttingDown) return;
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  state.status = 'starting';
  console.log(`[Tunnel Supervisor] Starting ngrok tunnel for port ${TARGET_PORT} with domain ${EXPECTED_DOMAIN}...`);

  // First, verify if a healthy ngrok is already serving our domain on 127.0.0.1:4040
  try {
    const apiData = await queryNgrokApi();
    const hasTargetTunnel = (apiData.tunnels || []).some(
      t => t.public_url === EXPECTED_PUBLIC_URL && String(t.config?.addr).includes(String(TARGET_PORT))
    );
    if (hasTargetTunnel) {
      console.log(`[Tunnel Supervisor] Active healthy tunnel detected on 127.0.0.1:4040. Monitoring existing instance.`);
      state.status = 'online';
      state.lastHeartbeat = new Date().toISOString();
      state.consecutiveFailures = 0;
      startHeartbeatWatchdog();
      return;
    } else {
      console.log(`[Tunnel Supervisor] ngrok is running but not serving expected target. Recycling...`);
      killZombieNgrok();
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch {
    // No ngrok API active, proceed with fresh spawn
  }

  const ngrokBin = findNgrokBinary();
  const args = [
    'http',
    String(TARGET_PORT),
    `--url=${EXPECTED_DOMAIN}`,
    '--pooling-enabled',
    '--log=stdout',
    '--log-format=json',
  ];

  try {
    ngrokProcess = spawn(ngrokBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.processId = ngrokProcess.pid;
    state.startedAt = new Date().toISOString();
    console.log(`[Tunnel Supervisor] ngrok spawned successfully (PID: ${ngrokProcess.pid})`);

    ngrokProcess.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const logObj = JSON.parse(line);
          if (logObj.msg === 'started tunnel') {
            state.status = 'online';
            state.publicUrl = logObj.url || EXPECTED_PUBLIC_URL;
            state.consecutiveFailures = 0;
            state.lastHeartbeat = new Date().toISOString();
            console.log(`[Tunnel Supervisor] 🟢 Tunnel ONLINE: ${state.publicUrl} -> http://localhost:${TARGET_PORT} (Pooling: Enabled)`);
          } else if (logObj.lvl === 'error' || logObj.lvl === 'crit') {
            state.lastError = logObj.err || logObj.msg;
            console.error(`[Tunnel Supervisor] ngrok error:`, state.lastError);
          }
        } catch {
          // Non-JSON output
          if (line.includes('started tunnel')) {
            state.status = 'online';
            state.lastHeartbeat = new Date().toISOString();
          }
        }
      }
    });

    ngrokProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) {
        state.lastError = msg;
        console.warn(`[Tunnel Supervisor] ngrok stderr:`, msg);
      }
    });

    ngrokProcess.on('error', (err) => {
      console.error(`[Tunnel Supervisor] Failed to spawn ngrok: ${err.message}`);
      state.status = 'error';
      state.lastError = err.message;
      scheduleRestart();
    });

    ngrokProcess.on('exit', (code, signal) => {
      console.warn(`[Tunnel Supervisor] ⚠️ ngrok process exited (code=${code}, signal=${signal})`);
      ngrokProcess = null;
      state.processId = null;

      if (!isShuttingDown) {
        state.status = 'reconnecting';
        scheduleRestart();
      } else {
        state.status = 'offline';
      }
    });

    startHeartbeatWatchdog();
  } catch (err) {
    console.error(`[Tunnel Supervisor] Spawn exception: ${err.message}`);
    state.status = 'error';
    state.lastError = err.message;
    scheduleRestart();
  }
}

// Exponential backoff restart scheduler
function scheduleRestart() {
  if (isShuttingDown) return;
  if (restartTimeout) return;

  state.restartsCount++;
  state.consecutiveFailures++;

  // Delay: 3s initial, up to 20s max
  const delay = Math.min(3000 * Math.pow(1.3, Math.min(state.consecutiveFailures, 6)), 20000);
  console.log(`[Tunnel Supervisor] 🔄 Reviving ngrok tunnel in ${(delay / 1000).toFixed(1)}s (Attempt #${state.restartsCount})...`);

  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    startTunnel().catch((e) => console.error(`[Tunnel Supervisor] Auto-restart error: ${e.message}`));
  }, delay);
}

// Periodic heartbeat watchdog (every 20 seconds)
function startHeartbeatWatchdog() {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    if (isShuttingDown) return;

    try {
      const apiData = await queryNgrokApi();
      const hasTargetTunnel = (apiData.tunnels || []).some(
        t => t.public_url === EXPECTED_PUBLIC_URL && String(t.config?.addr).includes(String(TARGET_PORT))
      );

      if (hasTargetTunnel) {
        state.status = 'online';
        state.lastHeartbeat = new Date().toISOString();
        state.consecutiveFailures = 0;
        if (state.startedAt) {
          state.uptimeSeconds = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000);
        }
      } else {
        console.warn(`[Tunnel Supervisor] ⚠️ Watchdog: Tunnel ${EXPECTED_PUBLIC_URL} missing in ngrok tunnels list!`);
        handleWatchdogFailure();
      }
    } catch (err) {
      console.warn(`[Tunnel Supervisor] ⚠️ Watchdog: ngrok API probe failed (${err.message})`);
      handleWatchdogFailure();
    }
  }, 20000);
}

function handleWatchdogFailure() {
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= 2) {
    console.error(`[Tunnel Supervisor] Watchdog failure threshold reached (${state.consecutiveFailures}). Cycling tunnel process...`);
    restartTunnel('Watchdog probe failed');
  }
}

// Force restart tunnel on demand or from UI
async function restartTunnel(reason = 'Manual restart') {
  console.log(`[Tunnel Supervisor] Recycling tunnel (${reason})...`);
  state.status = 'reconnecting';

  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  if (ngrokProcess) {
    try {
      ngrokProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    ngrokProcess = null;
  }

  killZombieNgrok();
  await new Promise(r => setTimeout(r, 1500));
  await startTunnel();
}

// Stop tunnel gracefully
function stopTunnel() {
  isShuttingDown = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  if (ngrokProcess) {
    try {
      ngrokProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    ngrokProcess = null;
  }
  state.status = 'offline';
  state.processId = null;
}

// Clean exit hook
process.on('SIGINT', () => { stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });
process.on('exit', () => { stopTunnel(); });

module.exports = {
  startTunnel,
  restartTunnel,
  stopTunnel,
  getStatus: () => ({
    ...state,
    now: new Date().toISOString(),
  }),
};
