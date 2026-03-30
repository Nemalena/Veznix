-- migrations/add_check_constraints.sql
-- Apply ONCE after initial schema push (prisma db push / prisma migrate deploy).
-- These constraints are not supported by Prisma natively, so we apply them manually.
-- Run: psql $DATABASE_URL -f migrations/add_check_constraints.sql

-- Ensure mailbox_access always has exactly one of user_id or group_id set, matching grantee_type
ALTER TABLE "MailboxAccess" ADD CONSTRAINT check_mailbox_access_grantee
  CHECK (
    ("granteeType" = 'USER'  AND "userId"  IS NOT NULL AND "groupId" IS NULL) OR
    ("granteeType" = 'GROUP' AND "groupId" IS NOT NULL AND "userId"  IS NULL)
  );

-- Ensure mentions always have exactly one of mentionedUserId or mentionedGroupId, matching mentionedType
ALTER TABLE "Mention" ADD CONSTRAINT check_mention_target
  CHECK (
    ("mentionedType" = 'USER'  AND "mentionedUserId"  IS NOT NULL AND "mentionedGroupId" IS NULL) OR
    ("mentionedType" = 'GROUP' AND "mentionedGroupId" IS NOT NULL AND "mentionedUserId"  IS NULL)
  );
