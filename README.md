# AWS Feedback Website

A customer feedback website using Node.js, Express and PostgreSQL. Designed for Docker deployment on AWS EC2 with Amazon RDS PostgreSQL.

## Features

- Customer form: full name, phone, email and message
- Server-side validation and parameterized PostgreSQL queries
- `/health` endpoint for container/ALB health checks
- Protected `GET /api/sync/feedback` endpoint for a future on-premises sync process (`x-api-key` header)
- Dockerfile and Docker Compose

## Database schema

Run `sql/init.sql` against the `feedback` database. It creates `customer_feedback` with `id`, `full_name`, `phone`, `email`, `message`, `created_at` and `updated_at`.

Run `sql/create-app-user.sql` as the RDS master user to create a restricted application role. Supply the password as a psql variable at runtime; do not save it in this repository.

## Run locally with Docker Compose

First copy `.env.example` to `.env` (the local Compose override supplies local database values). Then run:

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

Open http://localhost:3000 . To view logs:

```bash
docker compose -f compose.yaml -f compose.local.yaml logs -f web
```

Stop:

```bash
docker compose -f compose.yaml -f compose.local.yaml down
```

Remove the local database volume (this deletes local test data):

```bash
docker compose -f compose.yaml -f compose.local.yaml down -v
```

## Deploy against Amazon RDS

1. Create the `feedback` database if it was not created during RDS setup.
2. Run `sql/init.sql` as the RDS master user.
3. Run `sql/create-app-user.sql` as the RDS master user with a strong password supplied through the `APP_DB_PASSWORD` environment variable.
4. Copy `.env.example` to `.env` and set the RDS endpoint, database, application username, password and a long random `SYNC_API_KEY`.
5. Ensure the EC2 security group is allowed by the RDS security group on TCP 5432.
6. Download the AWS RDS CA bundle, place it at `certs/global-bundle.pem`, uncomment the COPY line in Dockerfile, and set `DB_SSL=true` and `DB_SSL_CA=/app/certs/global-bundle.pem` in `.env`.
7. Run:

```bash
docker compose up --build -d
```

Do not commit `.env`, database passwords, API keys or CA private keys to GitHub. The public AWS RDS CA bundle is not a secret, but should be versioned or copied into the image intentionally. For a production deployment, prefer AWS Secrets Manager or Systems Manager Parameter Store for secrets.

## API endpoints

- `GET /health` - process health check
- `POST /api/feedback` - submit a feedback record
- `GET /api/sync/feedback?since=2026-01-01T00:00:00Z&limit=100` - retrieve records for on-prem sync; requires `x-api-key`

The sync endpoint returns `id`; the on-premises database can store that value in its `aws_id` column and use an UPSERT to avoid duplicates.
