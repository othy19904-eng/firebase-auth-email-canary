'use strict';

const crypto = require('crypto');

const BASE = 'https://api.mail.tm';

function randomString(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

async function request(path, options = {}, phase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch {}
    console.log(JSON.stringify({ phase, ok: response.ok, status: response.status, durationMs: Date.now() - started }));
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  } catch (error) {
    console.error(JSON.stringify({
      phase,
      ok: false,
      status: error.status || null,
      name: error.name || null,
      message: error.message || null,
      cause: error.cause?.message || error.cause?.code || null,
      durationMs: Date.now() - started,
    }));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  let account = null;
  let token = null;
  try {
    const domains = await request('/domains', {}, 'domains');
    const available = (domains?.['hydra:member'] || []).filter((d) => d.isActive !== false);
    if (!available.length) throw new Error('No active Mail.tm domains');

    const address = `firebase-canary-${randomString(6)}@${available[0].domain}`;
    const password = `${randomString(10)}Aa1!`;

    account = await request('/accounts', {
      method: 'POST',
      body: JSON.stringify({ address, password }),
    }, 'accounts');

    const auth = await request('/token', {
      method: 'POST',
      body: JSON.stringify({ address, password }),
    }, 'token');
    token = auth?.token || null;

    console.log(JSON.stringify({ result: 'MAIL_TM_OK', accountCreated: Boolean(account?.id), tokenReceived: Boolean(token) }));
  } catch {
    process.exitCode = 1;
  } finally {
    if (account?.id && token) {
      try {
        await request(`/accounts/${encodeURIComponent(account.id)}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        }, 'cleanup');
      } catch {}
    }
  }
})();
