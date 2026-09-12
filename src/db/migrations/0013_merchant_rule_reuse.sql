ALTER TABLE "classification_rules" DROP CONSTRAINT "classification_rules_member_attribution_check";--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_member_attribution_check" CHECK ((
        (
          "classification_rules"."default_classification_type" = 'personal'
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" IN ('shared', 'household')
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" = 'income'
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_paid_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" IN ('transfer', 'ignore')
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_paid_by_member_id" IS NULL
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
      ));