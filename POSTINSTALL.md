# Firebase Auth Email Canary is installed

The scheduled canary is now configured to run **${param:SCHEDULE_FREQUENCY}**.

## What to expect

Each run writes one structured JSON result to Cloud Functions logs. The most important field is `diagnosis`.

Common diagnoses:

- `HEALTHY` — signup, trigger, inbox delivery, and action-code validation all passed.
- `FIREBASE_CONFIG_OR_AUTH_API_FAILURE` — Firebase rejected temporary user creation, commonly because Email/Password is disabled or the API key is invalid/restricted.
- `FIREBASE_TRIGGER_FAILURE` — Firebase created the user but rejected the verification-email trigger.
- `EMAIL_DELIVERY_FAILURE_OR_TEST_INBOX` — Firebase accepted the trigger but no message arrived before timeout.
- `MALFORMED_AUTH_EMAIL` — an email arrived but no usable `oobCode` was found.
- `ACTION_LINK_FAILURE` — the email arrived but Firebase rejected the action code.
- `TEST_INFRA_FAILURE` — the temporary inbox provider failed before Firebase could be tested reliably.
- `TEST_RUNTIME_FAILURE` — an unexpected runtime error occurred.

If you configured an alert webhook, the extension sends an alert only on non-`HEALTHY` runs.

## Logs

Open **Firebase console → Functions → Logs** and filter for the function created by this extension instance. Search for `firebase_auth_email_canary`.

## Privacy and cleanup

The Web API key is used by the function to call Firebase Auth REST endpoints. The extension does not intentionally persist it outside extension configuration. Temporary Firebase users and Mail.tm inboxes are deleted on a best-effort basis after each run.

Mail.tm attribution: temporary inbox infrastructure is provided by [Mail.tm](https://docs.mail.tm/).
