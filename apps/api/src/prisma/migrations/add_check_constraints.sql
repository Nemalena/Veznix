-- migrations/add_check_constraints.sql
ALTER TABLE "MailboxAccess" ADD CONSTRAINT check_mailbox_access_grantee
  CHECK (
    ("granteeType" = 'USER'  AND "userId"  IS NOT NULL AND "groupId" IS NULL) OR
    ("granteeType" = 'GROUP' AND "groupId" IS NOT NULL AND "userId"  IS NULL)
  );

ALTER TABLE "Mention" ADD CONSTRAINT check_mention_target
  CHECK (
    ("mentionedType" = 'USER'  AND "mentionedUserId"  IS NOT NULL AND "mentionedGroupId" IS NULL) OR
    ("mentionedType" = 'GROUP' AND "mentionedGroupId" IS NOT NULL AND "mentionedUserId"  IS NULL)
  );
