# Support Service

Port `8090`.

Owns the existing bug-report endpoints and `bug_reports` table access:

- `POST /vault/support/bug-reports`
- `GET /vault/support/bug-reports/my`

It validates user sessions through Auth Service and asks Email Delivery Service to send the admin notification. Email failure does not remove an already-saved bug report.
