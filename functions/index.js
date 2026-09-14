'use strict';

const functions = require('firebase-functions/v1');
const crypto = require('crypto');

const MAIL_BASE = 'https://api.mail.tm';
const FIREBASE_BASE = 'https://identitytoolkit.googleapis.com/v1';
const DEFAULT_SCHEDULE = 'every 30 minutes';
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 32000;

class CanaryError extends Error {
  constructor(diagnosis, message, details = {}) {
    super(message);
    this.name = 'CanaryError';
    this.diagnosis = diagnosis;
    this.details = details;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomString(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

function collectionItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.['hydra:member'])) return payload['hydra:member'];
  if (Array.isArray(payload?.member)) return payload.member;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function requestJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function mailRequest(path, { method = 'GET', token, body } = {}) {
  return requestJson(
    `${MAIL_BASE}${path}`,
    {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body ? JSON.stringify(body) : undefined,
    },
    7000,
  );
}

async function firebaseRequest(path, apiKey, body) {
  return requestJson(
    `${FIREBASE_BASE}${path}?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', body: JSON.stringify(body) },
    8000,
  );
}

async function createInbox() {
  try {
    const domains = await mailRequest('/domains');
    const available = collectionItems(domains).filter((item) => item?.isActive !== false && item?.domain);
    if (!available.length) {
      throw new Error('Mail.tm returned no active domains');
    }

    const domain = available[0].domain;
    const address = `firebase-canary-${randomString(6)}@${domain}`;
    const password = `${randomString(10)}Aa1!`;
    const account = await mailRequest('/accounts', {
      method: 'POST',
      body: { address, password },
    });
    const tokenResponse = await mailRequest('/token', {
      method: 'POST',
      body: { address, password },
    });

    if (!account?.id || !tokenResponse?.token) {
      throw new Error('Mail.tm account/token response was incomplete');
    }

    return {
      id: account.id,
      address,
      password,
      token: tokenResponse.token,
    };
  } catch (error) {
    throw new CanaryError('TEST_INFRA_FAILURE', 'Could not provision the temporary inbox', {
      provider: 'mail.tm',
      status: error.status || null,
      reason: error.message || null,
    });
  }
}

function extractOobCode(message) {
  const html = Array.isArray(message?.html) ? message.html.join('\n') : message?.html || '';
  const text = `${message?.text || ''}\n${html}`.replace(/&amp;/g, '&');
  const match = text.match(/[?&]oobCode=([^&\s"'<>]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function waitForVerificationEmail(inbox) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const inspected = new Set();

  while (Date.now() < deadline) {
    let listing;
    try {
      listing = await mailRequest('/messages', { token: inbox.token });
    } catch (error) {
      throw new CanaryError('TEST_INFRA_FAILURE', 'Mail.tm failed while polling for the verification email', {
        provider: 'mail.tm',
        status: error.status || null,
        reason: error.message || null,
      });
    }

    const messages = collectionItems(listing);
    for (const item of messages) {
      if (!item?.id || inspected.has(item.id)) continue;
      inspected.add(item.id);

      let message;
      try {
        message = await mailRequest(`/messages/${encodeURIComponent(item.id)}`, { token: inbox.token });
      } catch (error) {
        throw new CanaryError('TEST_INFRA_FAILURE', 'Mail.tm failed while reading the delivered email', {
          provider: 'mail.tm',
          status: error.status || null,
          reason: error.message || null,
        });
      }

      const oobCode = extractOobCode(message);
      if (oobCode) return { oobCode, messageId: item.id };

      const subject = String(message?.subject || item?.subject || '').toLowerCase();
      const sender = String(message?.from?.address || item?.from?.address || '').toLowerCase();
      if (subject.includes('verify') || subject.includes('verification') || sender.includes('noreply')) {
        throw new CanaryError('MALFORMED_AUTH_EMAIL', 'A likely Firebase Auth email arrived without a usable oobCode');
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new CanaryError(
    'EMAIL_DELIVERY_FAILURE_OR_TEST_INBOX',
    'Firebase accepted the verification trigger but no usable email arrived before timeout',
  );
}

async function deleteFirebaseUser(apiKey, idToken) {
  if (!apiKey || !idToken) return;
  try {
    await firebaseRequest('/accounts:delete', apiKey, { idToken });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'firebase_auth_email_canary_cleanup_warning',
        target: 'firebase_user',
        status: error.status || null,
      }),
    );
  }
}

async function deleteInbox(inbox) {
  if (!inbox?.id || !inbox?.token) return;
  try {
    await mailRequest(`/accounts/${encodeURIComponent(inbox.id)}`, {
      method: 'DELETE',
      token: inbox.token,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'firebase_auth_email_canary_cleanup_warning',
        target: 'mail_tm_inbox',
        status: error.status || null,
      }),
    );
  }
}

async function sendAlert(webhookUrl, result) {
  if (!webhookUrl) return;

  let parsed;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    console.warn(JSON.stringify({ event: 'firebase_auth_email_canary_alert_warning', reason: 'invalid_webhook_url' }));
    return;
  }
  if (parsed.protocol !== 'https:') {
    console.warn(JSON.stringify({ event: 'firebase_auth_email_canary_alert_warning', reason: 'webhook_not_https' }));
    return;
  }

  const summary = `Firebase Auth Email Canary: ${result.diagnosis} (${result.durationMs} ms)`;
  let payload;
  if (parsed.hostname === 'hooks.slack.com') {
    payload = { text: summary };
  } else if ((parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com') && parsed.pathname.includes('/api/webhooks/')) {
    payload = { content: summary };
  } else {
    payload = {
      event: 'firebase_auth_email_canary',
      diagnosis: result.diagnosis,
      durationMs: result.durationMs,
      timestamp: result.timestamp,
    };
  }

  try {
    await requestJson(webhookUrl, { method: 'POST', body: JSON.stringify(payload) }, 8000);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'firebase_auth_email_canary_alert_warning',
        reason: 'webhook_delivery_failed',
        status: error.status || null,
      }),
    );
  }
}

async function runCanary() {
  const startedAt = Date.now();
  const apiKey = process.env.WEB_API_KEY;
  const webhookUrl = process.env.ALERT_WEBHOOK_URL || '';
  let inbox = null;
  let firebaseIdToken = null;
  let diagnosis = 'TEST_RUNTIME_FAILURE';
  let details = {};

  try {
    if (!apiKey) {
      throw new CanaryError('FIREBASE_CONFIG_OR_AUTH_API_FAILURE', 'WEB_API_KEY is missing');
    }

    inbox = await createInbox();
    const firebasePassword = `${randomString(12)}Aa1!`;

    let signup;
    try {
      signup = await firebaseRequest('/accounts:signUp', apiKey, {
        email: inbox.address,
        password: firebasePassword,
        returnSecureToken: true,
      });
    } catch (error) {
      throw new CanaryError('FIREBASE_CONFIG_OR_AUTH_API_FAILURE', 'Firebase rejected temporary user creation', {
        status: error.status || null,
        firebaseError: error.body?.error?.message || null,
      });
    }

    firebaseIdToken = signup?.idToken;
    if (!firebaseIdToken) {
      throw new CanaryError('FIREBASE_CONFIG_OR_AUTH_API_FAILURE', 'Firebase signup response did not contain an ID token');
    }

    try {
      await firebaseRequest('/accounts:sendOobCode', apiKey, {
        requestType: 'VERIFY_EMAIL',
        idToken: firebaseIdToken,
      });
    } catch (error) {
      throw new CanaryError('FIREBASE_TRIGGER_FAILURE', 'Firebase rejected the verification-email trigger', {
        status: error.status || null,
        firebaseError: error.body?.error?.message || null,
      });
    }

    const delivered = await waitForVerificationEmail(inbox);

    let verification;
    try {
      verification = await firebaseRequest('/accounts:update', apiKey, {
        oobCode: delivered.oobCode,
      });
    } catch (error) {
      throw new CanaryError('ACTION_LINK_FAILURE', 'Firebase rejected the delivered verification action code', {
        status: error.status || null,
        firebaseError: error.body?.error?.message || null,
      });
    }

    if (verification?.emailVerified === false) {
      throw new CanaryError('ACTION_LINK_FAILURE', 'Firebase processed the action code but did not report the email as verified');
    }

    diagnosis = 'HEALTHY';
  } catch (error) {
    if (error instanceof CanaryError) {
      diagnosis = error.diagnosis;
      details = error.details || {};
    } else {
      diagnosis = 'TEST_RUNTIME_FAILURE';
      details = { error: error?.name || 'Error' };
    }
  } finally {
    await deleteFirebaseUser(apiKey, firebaseIdToken);
    await deleteInbox(inbox);
  }

  const result = {
    event: 'firebase_auth_email_canary',
    diagnosis,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
    ...details,
  };

  console.log(JSON.stringify(result));
  if (diagnosis !== 'HEALTHY') {
    await sendAlert(webhookUrl, result);
  }

  return result;
}

exports.scheduledCanary = functions.pubsub
  .schedule(process.env.SCHEDULE_FREQUENCY || DEFAULT_SCHEDULE)
  .timeZone('UTC')
  .onRun(async () => runCanary());
