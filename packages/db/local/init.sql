-- Local development credentials only. The bootstrap superuser is not an application account.
CREATE ROLE trustdesk_migrator LOGIN PASSWORD 'trustdesk_local_migrator'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE trustdesk_app LOGIN PASSWORD 'trustdesk_local_app'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE DATABASE trustdesk OWNER trustdesk_migrator;
CREATE DATABASE trustdesk_test OWNER trustdesk_migrator;
REVOKE ALL ON DATABASE trustdesk, trustdesk_test FROM PUBLIC;
GRANT CONNECT ON DATABASE trustdesk, trustdesk_test TO trustdesk_app;

\connect trustdesk
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
\connect trustdesk_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
