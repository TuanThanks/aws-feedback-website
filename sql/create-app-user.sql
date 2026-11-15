-- Run as the RDS master user with psql:
-- psql "$DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f sql/create-app-user.sql
-- The password is supplied at runtime and is not stored in this repository.

CREATE ROLE feedback_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE feedback TO feedback_app;
GRANT USAGE ON SCHEMA public TO feedback_app;
GRANT SELECT, INSERT ON TABLE customer_feedback TO feedback_app;
GRANT USAGE, SELECT ON SEQUENCE customer_feedback_id_seq TO feedback_app;
