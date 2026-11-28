ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_of_transaction_id uuid REFERENCES transactions(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS transactions_refund_purchase_idx ON transactions(refund_of_transaction_id)
WHERE refund_of_transaction_id IS NOT NULL;
