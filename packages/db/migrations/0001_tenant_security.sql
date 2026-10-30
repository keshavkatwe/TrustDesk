-- Table owners are subject to policies too; migration/seed commands set tenant context.
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE approvers FORCE ROW LEVEL SECURITY;
ALTER TABLE receiving_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogue_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogue_rows FORCE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO trustdesk_app;
GRANT SELECT ON tenants, approvers, receiving_channels, catalogue_versions, catalogue_rows TO trustdesk_app;
-- The foundation allows scoped approver maintenance; published catalogues are read-only to the app.
GRANT INSERT, UPDATE ON approvers TO trustdesk_app;
