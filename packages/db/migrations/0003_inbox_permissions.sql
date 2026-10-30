ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;

GRANT SELECT ON conversations, messages, drafts, reviews, outbox TO trustdesk_app;
GRANT UPDATE ON conversations, drafts TO trustdesk_app;
GRANT INSERT ON reviews, outbox TO trustdesk_app;
-- Reviews are append-only and outbox payloads are read through their approved review.
