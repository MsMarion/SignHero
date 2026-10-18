# SignHero deploy pipeline (CI/CD)

Merge to `main` and production updates itself, with a test afterwards and an automatic rollback.

```
pull request ──> ci.yml (GitHub-hosted): types, build, account tests on MongoDB, backend checks
                  │ main is protected: a PR with these checks passing is the only way in
merge to main ──> deploy.yml
   job deploy   [self-hosted runner on CT113] ssh signhero-ct129 "deploy <sha>"   (GPU backend first)
                                              ssh signhero-ct119 "deploy <sha>"   (frontend)
   job smoke    [GitHub-hosted]  tests/smoke/whack-smoke.mjs against the public site
   job rollback [self-hosted]    only if smoke failed: "rollback" on both hosts, then the run fails
```

The runner **never checks out the repository**. All logic is in `/usr/local/bin/signhero-deploy` on each
host (root-owned, installed by hand, never self-updating). The runner reaches it with a restricted SSH key
whose forced command (`signhero-deploy-entry`) accepts only `status`, `backup`, `rollback` and
`deploy <40-hex sha>`. The hosts fetch `origin/main` themselves and refuse any sha that is not on it, so a
branch cannot get code deployed.

## Files
| File | Where it runs |
|---|---|
| `signhero-deploy-entry` | CT119 and CT129, `/usr/local/bin/`, forced command of the deploy key |
| `ct119/signhero-deploy` | CT119 (frontend: Next.js, MongoDB, MinIO), `/usr/local/bin/signhero-deploy` |
| `ct129/signhero-deploy` | CT129 (GPU backend), `/usr/local/bin/signhero-deploy` |
| `.github/workflows/ci.yml`, `deploy.yml`, `manage.yml` | GitHub Actions |

## What a deploy does
**CT119:** check the sha is on `origin/main` and the tree is clean, back up MongoDB (`/var/backups/signhero`, newest 10 kept),
fast-forward, `pnpm install`, **build aside** into `.next-<sha12>` while the current release keeps serving,
`prisma db push` (no `--accept-data-loss`, so a destructive change aborts before anything is switched),
write `NEXT_DIST_DIR` to `/etc/signhero/dist.env`, restart (about 3 s), health-check. Old build folders are pruned (current and previous kept).
**CT129:** same sha checks, fast-forward `/opt/signhero-repo`, recreate the container, health-check (CUDA, and a real WebSocket frame
answered by the model). The container runs the backend **code from the clone** (mounted read-only), so a normal release builds nothing:
about 15 seconds and no disk. A new image (`signhero-api:<sha12>`, next to the running one) is built only when `backend/Dockerfile` or
`backend/requirements.txt` change, and then 16 GB must be free or the deploy refuses before changing anything. Triton is never touched.
Why no rebuild by default: the image is about 12 GB of dependencies, and rebuilding it needs the Docker build cache, which does not fit on
CT129's 55 GB disk next to Triton (an attempt with the cache cleared ran out of disk; the deploy rolled back and the backend never went down).

Any failure after the repository changes rolls back automatically and still exits non-zero.
**Database changes must be additive.** `rollback` does not restore the database; restoring a dump is a manual step on purpose:
```bash
# on CT119, as root: pick a dump, then
docker exec -i asl-mongodb mongorestore --archive --gzip --drop --nsInclude 'signhero.*' < /var/backups/signhero/<file>.archive.gz
```

## One-time setup (done by hand, supervised)
**CT113 (runner host).** A separate Linux user, so a workflow can never read the keys of the other runner (`runner`):
```bash
useradd -m -s /bin/bash signhero-runner
sudo -u signhero-runner ssh-keygen -t ed25519 -N '' -C signhero-deploy@runner -f /home/signhero-runner/.ssh/id_ed25519
# /home/signhero-runner/.ssh/config:
#   Host signhero-ct119
#     HostName 192.168.2.8
#     User deploy
#     IdentityFile ~/.ssh/id_ed25519
#     IdentitiesOnly yes
#     StrictHostKeyChecking accept-new
#   Host signhero-ct129      (HostName 192.168.2.107, same options)
```
Install the GitHub Actions runner in that user's home, registered to `MsMarion/SignHero` with the label `signhero-deploy`,
and run it as a service. The registration token comes from GitHub (Settings > Actions > Runners > New self-hosted runner,
or `gh api -X POST repos/MsMarion/SignHero/actions/runners/registration-token`). It expires in about an hour; never commit it.

**CT119 and CT129.**
```bash
useradd -m -s /bin/bash deploy && passwd -l deploy
install -o root -g root -m 755 signhero-deploy-entry /usr/local/bin/signhero-deploy-entry
install -o root -g root -m 755 <ct119|ct129>/signhero-deploy /usr/local/bin/signhero-deploy
echo 'deploy ALL=(root) NOPASSWD: /usr/local/bin/signhero-deploy' > /etc/sudoers.d/signhero-deploy && chmod 440 /etc/sudoers.d/signhero-deploy && visudo -cf /etc/sudoers.d/signhero-deploy
mkdir -p /var/lib/signhero-deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# /home/deploy/.ssh/authorized_keys (one line, the PUBLIC key from CT113):
#   restrict,command="/usr/local/bin/signhero-deploy-entry" ssh-ed25519 AAAA... signhero-deploy@runner
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh
```
**CT119 only:** `mkdir -p /var/backups/signhero /etc/signhero`, and add `EnvironmentFile=-/etc/signhero/dist.env` to
`/etc/systemd/system/signhero-frontend.service` (the dash makes it optional), then `systemctl daemon-reload`.
**CT129 only:** clone the repo to `/opt/signhero-repo` (`git clone https://github.com/MsMarion/SignHero.git`) and install
`ct129/docker-compose.host.example.yml` as `/opt/signhero-api-prod/docker-compose.yml` (it uses the NVIDIA runtime, names the image
`signhero-api:${IMAGE_TAG:-prod}`, and mounts the backend code from the clone read-only). Build the image once by hand
(`cd /opt/signhero-api-prod && docker compose build`).

Verify the restriction (from CT113 as `signhero-runner`): `status` works; `id`, `status; id`, an unknown verb, `deploy abc`, a pty request,
password login and port forwarding must all be refused.

## Known limits
- **A deploy briefly interrupts live play.** The frontend restart is about 3 seconds (one failed request in a 1-second probe of the public
  site); the backend swap is about 10 seconds during which the public backend endpoint answers 502. The game does not reconnect its
  detection WebSocket by itself, so a round in progress at that moment loses detection until the player starts the next game. Prefer quiet times.
- Rollback never restores the database; schema changes must be additive.
- The Mongo dumps are on CT119's own disk (newest 10 kept), so they do not survive losing that disk.
- The verb scripts and the CT129 host compose are installed by hand; changing them needs a manual copy to each host.

## Repository settings
`main` is protected: a pull request is required, the three CI checks (`web (types and build)`, `account tests (MongoDB)`,
`backend and compose (static checks)`) must pass, no force-pushes or deletions, enforced for admins. Workflows from outside
contributors need approval. The default workflow token is read-only. Third-party actions are pinned to full commit SHAs.
No GitHub secrets are used: the SSH key lives only on CT113, and the application secrets (Google, NextAuth, database) stay in
`/opt/signhero/asl/.env` on CT119.

## Day to day
- Merge a PR: CI runs on the PR, the deploy runs after the merge, the smoke test runs against production, and a failing smoke test rolls back.
- **Actions > Manage production > Run workflow** for `status`, `backup`, `rollback`, or a `deploy` of a specific sha.
- Updating the verb scripts themselves needs a manual copy to each host (they never update themselves): `scp` the file, then
  `install -o root -g root -m 755 ...` as above.
- Manual failure drill on a host, as root: `SIGNHERO_TEST_HEALTH_PATH=/does-not-exist signhero-deploy deploy <sha>` (CT119) or
  `SIGNHERO_TEST_EXPECT_DEVICE=tpu signhero-deploy deploy <sha>` (CT129) forces the health check to fail and shows the automatic rollback.
