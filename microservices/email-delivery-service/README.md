# Email Delivery Service

Internal-only service on port `8091`.

Owns Gmail API delivery and the existing templates for:

- email verification
- password reset
- two-factor authentication
- bug-report admin notifications

Every `/internal/emails/**` request requires `X-Internal-Service-Key`. Do not route this service publicly through the API Gateway.
