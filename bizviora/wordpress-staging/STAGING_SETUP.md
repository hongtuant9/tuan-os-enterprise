# BIZVIORA WordPress local staging — operator checklist

This is an isolated localhost-only preview, NOT internet staging and NOT production. Do not run on the production server.
The Docker Engine must be running, free memory >3GiB and disk space >5GiB, and port 8088 free before starting. Never install Docker automatically or expose port 8088 publicly.

1. Review image provenance/versions, storage use, backups, and approval for environment startup.
2. Generate two separate random strong passwords LOCALLY into secrets/db_app_password and secrets/db_root_password with restrictive permissions. Never paste them in chat, Git, Drive or logs. Do not commit secrets/.
3. From bizviora/wordpress-staging, validate with docker compose config --quiet; then docker compose up -d.
4. Open http://127.0.0.1:8088 only on authorized host, complete WordPress setup with administrator credential set via browser; enable theme BIZVIORA Marketing.
5. Confirm front page, mobile layout, admin editability, routes, privacy and no lead collection. Keep search engines blocked in local staging.
6. Backup separately both database (mysqldump/mariadb-dump) and wp_data volume; encrypt off-host with owner-held key; restore into a second isolated environment and verify pages/admin.
7. Stop staging with docker compose down (NEVER -v while backups not independently verified).
8. To advance to public staging, select a host with TLS, access controls, backup and explicit approval. DO NOT point bizviora.com to local staging.

Current status: compose prepared, not run. Landing theme visual and lead receiver are not production ready.
