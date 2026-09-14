# Before you install

Firebase Auth Email Canary performs a real end-to-end check of the Firebase Authentication verification-email path:

1. Creates a temporary inbox using the **Mail.tm** API.
2. Creates a temporary Firebase Auth user with Email/Password.
3. Triggers a real `VERIFY_EMAIL` email through Firebase Authentication.
4. Waits for the message to arrive in the temporary inbox.
5. Extracts the `oobCode` and verifies that Firebase accepts it.
6. Attempts to delete both the temporary Firebase user and temporary inbox.
7. Writes a structured result to Cloud Functions logs and optionally posts a failure alert to your webhook.

## Requirements

- Your Firebase project must use the **Blaze** plan because Firebase Extensions deploy Cloud Functions and Cloud Scheduler resources.
- Enable **Authentication → Email/Password** before installing.
- Copy your project's **Web API key** from **Project settings → General → Your apps**.
- Cloud Scheduler is used for recurring runs. Google Cloud pricing/free-tier rules apply.
- If you configure an alert webhook, the value is stored in **Cloud Secret Manager**, which can incur Google Cloud charges outside free tiers.

## External service

This extension uses [Mail.tm](https://docs.mail.tm/) to create a temporary test inbox. Mail.tm documents its API as free, with an 8 QPS limit, and requires attribution. The extension is not affiliated with Mail.tm. A Mail.tm outage is classified separately as `TEST_INFRA_FAILURE` where possible.

## Important limitation

A timeout after Firebase accepts the trigger proves that this end-to-end path failed, but by itself it does **not** prove Firebase was the cause. The temporary inbox provider or Internet delivery path can also fail. Treat the diagnosis as an operational signal, not a root-cause guarantee.
