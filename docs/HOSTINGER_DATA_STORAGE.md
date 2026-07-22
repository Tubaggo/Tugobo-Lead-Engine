# Hostinger VPS — Operational Data Storage

**Applies from:** v3.7.5
**Scope:** where the Lead Engine keeps the founder's pipeline on the VPS, and
how to back it up, restore it, and not delete it during a deploy.

---

## 1. What is stored on the server

One JSON file holds all critical operational state:

```
$LEAD_ENGINE_DATA_DIR/operational-state.json
```

It contains, per lead: queue membership, sales stage, next follow-up date,
founder notes, the workflow record, manual overrides, an optional AI snapshot,
and the activity timeline. It also holds the imported lead roster and today's
outreach queue.

It does **not** contain credentials, API keys, or any auth material. Those stay
in the environment.

---

## 2. Required environment variable

```env
LEAD_ENGINE_DATA_DIR=/var/lib/tugobo-lead-engine
```

This **must** be set in production and **must** point outside the repository
checkout. If it is unset the app falls back to `.data/` inside the project
directory, which is correct for development but on a VPS would be destroyed by
the next `git clone` / deploy.

The variable is read only on the server (`app/lib/operational-state/env.ts` is
`server-only`). It is never prefixed `NEXT_PUBLIC_` and never reaches the
browser bundle.

---

## 3. Creating the directory

Run once, as root, before the first deploy:

```bash
sudo mkdir -p /var/lib/tugobo-lead-engine
```

Give it to the user PM2 runs the app as. If PM2 runs as `tugobo`:

```bash
sudo chown -R tugobo:tugobo /var/lib/tugobo-lead-engine
sudo chmod 700 /var/lib/tugobo-lead-engine
```

`700` matters: the file is real customer pipeline data and should not be
readable by other accounts on the box. The app also creates the directory itself
with `0700` and writes the state file `0600` if it does not exist yet.

**The PM2 user must have write permission on this directory.** If it does not,
`/api/health` returns `503` with `"storage":"unavailable"` and every save fails
visibly in the UI. That is deliberate — an app that looks like it is working
while silently discarding edits is the worse outcome.

Verify:

```bash
sudo -u tugobo test -w /var/lib/tugobo-lead-engine && echo writable
```

---

## 4. Deploying without destroying data

The data directory is outside the repository, so an ordinary deploy cannot
touch it. Two rules keep it that way:

- **Never** point `LEAD_ENGINE_DATA_DIR` inside the checkout on the VPS.
- **Never** `rm -rf` a parent of `/var/lib/tugobo-lead-engine` during deploy.

A deploy is safe as long as it only replaces the app directory:

```bash
cd /path/to/TUGOBO-LEAD-ENGINE-V3.7.1
git pull
pnpm install
pnpm build
pm2 restart tugobo-lead-engine
```

After restarting, confirm storage is healthy:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","service":"tugobo-lead-engine","storage":"ready",...}
```

`storage: "ready"` means the directory exists and is writable. A state file that
does not exist yet is still `ready` — a fresh install has nothing saved.

---

## 5. Backup

```bash
cd /path/to/TUGOBO-LEAD-ENGINE-V3.7.1
LEAD_ENGINE_DATA_DIR=/var/lib/tugobo-lead-engine pnpm state:backup
```

Writes a timestamped snapshot to:

```
/var/lib/tugobo-lead-engine/backups/operational-state-YYYYMMDD-HHmmss.json
```

- Retains the **20** most recent snapshots and prunes older ones.
- Refuses to back up a file that is not valid operational state, so a corrupt
  source cannot quietly replace good snapshots.
- Prints the backup path and a retained count — never lead data, note text, or
  environment values.

Suggested cron (daily at 03:00), as the PM2 user:

```cron
0 3 * * * cd /path/to/TUGOBO-LEAD-ENGINE-V3.7.1 && LEAD_ENGINE_DATA_DIR=/var/lib/tugobo-lead-engine /usr/bin/pnpm state:backup >> /var/log/tugobo-backup.log 2>&1
```

Because backups live inside the data directory, copy them off the box
periodically if you want protection against losing the VPS itself.

### Automatic pre-reset snapshots

The test-data cleanup in the app (**Veri ve Operasyon → Dokunulmamış Duruma
Getir**, and the bulk actions on the follow-ups page) takes its own snapshot
before it changes anything:

```
/var/lib/tugobo-lead-engine/backups/operational-state-YYYYMMDD-HHmmss-pre-reset.json
```

- Written **before** the write lock is taken, so a failed snapshot means the
  reset never ran. The API answers `503` and the UI says nothing was reset.
- A byte copy of the file on disk, not a re-serialization of parsed state — a
  backup that went through the normalizer is a backup of what we *think* the
  file said.
- **Exempt from the cron's 20-file retention.** `pnpm state:backup` skips
  `-pre-reset` names when pruning, so the undo for a cleanup cannot be aged out
  while you still think it is there. Clear them by hand once you are satisfied
  with a reset.
- The reset never touches `roster`, so business data, scores, enrichment and
  channel verification survive it regardless.

To undo a reset, restore the matching `-pre-reset` snapshot using section 7.

---

## 6. Verify

```bash
LEAD_ENGINE_DATA_DIR=/var/lib/tugobo-lead-engine pnpm state:verify
```

Reports schema version and counts (leads, roster entries, activity entries,
file size) and flags any quarantined files. It prints no lead content.

Exit code is non-zero when the file is unreadable, is not JSON, or has an
unexpected schema version.

---

## 7. Restore

1. Stop the app so nothing writes during the swap:

   ```bash
   pm2 stop tugobo-lead-engine
   ```

2. Keep the current file aside rather than deleting it:

   ```bash
   cd /var/lib/tugobo-lead-engine
   mv operational-state.json operational-state.json.before-restore-$(date +%Y%m%d-%H%M%S)
   ```

3. Copy the chosen snapshot into place:

   ```bash
   cp backups/operational-state-20260721-030000.json operational-state.json
   chown tugobo:tugobo operational-state.json
   chmod 600 operational-state.json
   ```

4. Verify before starting:

   ```bash
   LEAD_ENGINE_DATA_DIR=/var/lib/tugobo-lead-engine pnpm state:verify
   ```

5. Start and re-check health:

   ```bash
   pm2 start tugobo-lead-engine
   curl -s http://localhost:3000/api/health
   ```

---

## 8. Corrupt-file behaviour

If the state file cannot be parsed, the app does **not** reset it. It renames it
to:

```
operational-state.json.corrupt-<timestamp>
```

and starts from empty. The original bytes are preserved for recovery. API reads
return `503 storage unavailable` rather than an empty pipeline presented as
truth.

If you see a `.corrupt-*` file, restore from a backup (§7) rather than deleting
it.

---

## 9. Development behaviour

With `LEAD_ENGINE_DATA_DIR` unset, the app uses `.data/` in the project root.
That path is gitignored, so local pipeline data is never committed. The same
scripts work against it:

```bash
pnpm state:verify
pnpm state:backup
```

---

## 10. Known constraint: single process

Writes are serialized by an in-process lock, which is correct for the intended
deployment: **one PM2 instance, one founder**. Running the app in PM2 cluster
mode, or two processes against the same data directory, could interleave writes
and lose an update. If clustering is ever needed, the store needs an on-disk
lock first.
