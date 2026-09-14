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

## Install locally while Hub submissions are paused

Firebase currently documents that new Extensions Hub submissions are temporarily paused. You can still develop/test the extension locally using the Firebase CLI and Extensions emulator.

When publishing reopens, this repository is structured for Firebase Extensions Hub submission (`extension.yaml`, required docs, Apache-2.0 license, and function source).

## External service

Temporary inboxes use [Mail.tm](https://docs.mail.tm/), whose API documentation says access is free, requires no API key, is rate-limited to 8 QPS per IP, and requires attribution. This project is not affiliated with Mail.tm.

## License

Apache-2.0. See [LICENSE](LICENSE).
