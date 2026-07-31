# Subscription Service

The Guardian microservice that owns subscriptions, entitlements and Paystack payment processing.

Default port: `8083`

Required environment variables:

- `DATABASE_URL`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `INTERNAL_SERVICE_KEY`
- `PAYSTACK_SECRET_KEY`

Optional local URL overrides:

- `AUTH_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `PAYSTACK_CALLBACK_URL`
- `PAYSTACK_BASE_URL`
