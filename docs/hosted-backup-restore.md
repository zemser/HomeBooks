# Hosted Backup and Restore Runbook

This runbook is for the private hosted two-user version of Fin App on Supabase Postgres.

The goal is a manual, encrypted, restorable database backup path without giving a third-party backup job long-lived database access. Run it from a trusted developer machine.

## Scope

Back up:

- app tables and schema in Supabase Postgres
- Drizzle-managed migrations and RLS policies already present in the database

Do not back up with this command:

- Supabase Auth user secrets
- Supabase Storage objects
- local `.env*` files or credentials

Supabase Storage is currently used only for temporary import processing. Successful imports delete the source object after persistence, and failed objects are cleaned by `npm run imports:cleanup-failed`.

## Prerequisites

Install command-line tools on the machine running the backup:

```bash
pg_dump --version
pg_restore --version
gpg --version
```

Use a database URL with enough privileges to dump the application database. For Supabase this is usually a direct Postgres connection string, not the app runtime role.

Set local-only environment variables:

```bash
export FINAPP_BACKUP_DATABASE_URL='postgres://...'
export FINAPP_BACKUP_RECIPIENT='your-gpg-key-id-or-email'
export FINAPP_BACKUP_DIR="$HOME/finapp-backups"
```

Create the backup directory:

```bash
mkdir -p "$FINAPP_BACKUP_DIR"
chmod 700 "$FINAPP_BACKUP_DIR"
```

## Create an Encrypted Backup

Use the checked-in helper:

```bash
npm run backup:create
```

It creates a custom-format dump, encrypts it with GPG, writes a SHA-256 checksum beside it, prints both paths, and removes the unencrypted dump.

The underlying commands are:

```bash
backup_name="finapp-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump \
  "$FINAPP_BACKUP_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$FINAPP_BACKUP_DIR/$backup_name"

gpg \
  --encrypt \
  --recipient "$FINAPP_BACKUP_RECIPIENT" \
  --output "$FINAPP_BACKUP_DIR/$backup_name.gpg" \
  "$FINAPP_BACKUP_DIR/$backup_name"

shasum -a 256 "$FINAPP_BACKUP_DIR/$backup_name.gpg" \
  > "$FINAPP_BACKUP_DIR/$backup_name.gpg.sha256"

rm "$FINAPP_BACKUP_DIR/$backup_name"
```

Record these details outside the repo:

- backup filename
- SHA-256 checksum
- Supabase project id
- database migration head at the time of backup
- operator and reason for backup

Get the migration head with:

```bash
psql "$FINAPP_BACKUP_DATABASE_URL" -c 'select * from "__drizzle_migrations" order by created_at desc limit 5;'
```

If that table name differs after a Drizzle upgrade, inspect migration tables before relying on the command.

## Verify the Backup File

Use the checked-in helper:

```bash
export FINAPP_BACKUP_FILE="$FINAPP_BACKUP_DIR/finapp-YYYYMMDDTHHMMSSZ.dump.gpg"
npm run backup:verify
```

It verifies the `.sha256` file when present, decrypts the backup, asks `pg_restore` to list the archive catalog, and prints the first catalog entries.

Check the encrypted file exists and matches its checksum:

```bash
cd "$FINAPP_BACKUP_DIR"
shasum -a 256 --check "$backup_name.gpg.sha256"
```

Confirm it decrypts and the dump catalog is readable:

```bash
gpg --decrypt "$FINAPP_BACKUP_DIR/$backup_name.gpg" \
  | pg_restore --list --file=/tmp/finapp-restore-list.txt

sed -n '1,40p' /tmp/finapp-restore-list.txt
rm /tmp/finapp-restore-list.txt
```

## Local Restore Drill

Run this drill before treating the runbook as proven.

Create an empty local database:

```bash
createdb finapp_restore_drill
export FINAPP_RESTORE_DATABASE_URL='postgres://postgres:postgres@localhost:5432/finapp_restore_drill'
```

Restore the encrypted dump:

```bash
gpg --decrypt "$FINAPP_BACKUP_DIR/$backup_name.gpg" \
  | pg_restore \
      --dbname="$FINAPP_RESTORE_DATABASE_URL" \
      --clean \
      --if-exists \
      --no-owner \
      --no-acl
```

Run basic integrity checks:

```bash
psql "$FINAPP_RESTORE_DATABASE_URL" -c 'select count(*) as workspaces from workspaces;'
psql "$FINAPP_RESTORE_DATABASE_URL" -c 'select count(*) as users from users;'
psql "$FINAPP_RESTORE_DATABASE_URL" -c 'select count(*) as imports from imports;'
psql "$FINAPP_RESTORE_DATABASE_URL" -c 'select count(*) as transactions from transactions;'
```

Run the app against the restored database in local mode:

```bash
DATABASE_URL="$FINAPP_RESTORE_DATABASE_URL" npm run dev
```

Open `http://localhost:3000` and spot-check:

- home loads
- settings show the expected workspace/member data
- expenses and reports render
- investments render latest saved holdings/activity where present

Drop the drill database when done:

```bash
dropdb finapp_restore_drill
```

## Hosted Restore Outline

Use hosted restore only for an intentional recovery event or a rehearsal against a disposable Supabase project.

1. Pause app traffic or point Vercel away from the target database.
2. Create a fresh Supabase database or disposable recovery project.
3. Confirm the target database URL is not the live database by mistake.
4. Decrypt and restore the selected backup with `pg_restore --clean --if-exists --no-owner --no-acl`.
5. Reapply any migrations that were created after the backup timestamp.
6. Confirm RLS policies exist and normal app traffic uses the non-bypass runtime role.
7. Run `npm run smoke:rls` against the runtime role.
8. Run hosted sign-in, TOTP MFA, onboarding, imports, reports, settlements, and investments smoke tests.
9. Repoint app traffic only after the restored database passes the checks.

## Safety Rules

- Never commit backup files, decrypted dumps, database URLs, GPG keys, or checksum records that expose project details.
- Never run restore commands against the live database without first pausing traffic and confirming the exact target URL.
- Do not use the normal app runtime role for backups if it cannot see all rows because of RLS.
- Do not use admin or service-role database credentials for normal app traffic after restore.
- Keep at least one recent encrypted backup in a separate trusted location.
