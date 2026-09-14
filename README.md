# Firebase Auth Email Canary

A Firebase Extension that continuously tests the **real verification-email path** instead of only checking whether Firebase Authentication reports healthy.

## What it checks

`temporary signup → VERIFY_EMAIL trigger → real inbox delivery → oobCode validation → cleanup`

The extension runs on Cloud Scheduler, emits structured logs, and can optionally send failure alerts to a webhook.

## Why

Authentication incidents can be silent from an application's point of view: an API call can succeed while a verification email never reaches users. This canary checks the customer-visible path end to end.

## Diagnoses

- `HEALTHY`
- `FIREBASE_CONFIG_OR_AUTH_API_FAILURE`
- `FIREBASE_TRIGGER_FAILURE`
- `EMAIL_DELIVERY_FAILURE_OR_TEST_INBOX`
- `MALFORMED_AUTH_EMAIL`
- `ACTION_LINK_FAILURE`
- `TEST_INFRA_FAILURE`
- `TEST_RUNTIME_FAILURE`

## Repository structure

- `extension.yaml` — extension metadata, APIs, parameters, and scheduled function resource.
- `functions/package.json` — Node.js 22 function package.
- `functions/index.js` — end-to-end canary implementation.
- `PREINSTALL.md` / `POSTINSTALL.md` — installation and operating guidance.
- `CHANGELOG.md` — release history.

## Firebase Extensions status

Firebase has deprecated the managed Firebase Extensions service and plans to shut it down on **March 31, 2027**. Existing deployed extension resources continue to run on their underlying Google Cloud infrastructure, but managed update/reconfigure/uninstall functionality ends with the service. New public Hub submissions are currently paused.

This repository can still be used for local development/testing and as source code for a migration to ordinary Cloud Functions / Cloud Scheduler deployment.

## External service

Temporary inboxes use [Mail.tm](https://docs.mail.tm/), whose API documentation says access is free, requires no API key, is rate-limited to 8 QPS per IP, and requires attribution. This project is not affiliated with Mail.tm.

## License

Apache-2.0. See [LICENSE](LICENSE).
