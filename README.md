# Vegastar ERP (Ruby on Rails)

1:1 port of the Google Apps Script ERP portal (`../Source/`) to Rails 8 + PostgreSQL.

## Quick start (fresh machine)

```powershell
powershell -ExecutionPolicy Bypass -File "..\_staging\tools\setup.ps1"
```

That script installs Ruby/Rails if missing, scaffolds the app, copies the staged
source, ports the frontend, prepares the database, and runs the tests.

## Manual setup

1. Install Ruby 3.3 + DevKit: `winget install RubyInstallerTeam.RubyWithDevKit.3.3`
2. `gem install rails -v "~> 8.0"`
3. Postgres running on localhost. Credentials via `PGUSER` / `PGPASSWORD`
   (defaults baked into `config/database.yml` for this machine)
4. `bundle install`
5. `bin/rails active_storage:install && bin/rails db:prepare db:seed`
6. `bin/rails server` → http://localhost:3000

**Default login:** `admin@vegastar.local` / `ChangeMe123!` (change it after first login).

## Notes

- **Emails (dev):** letter_opener pops each email in the browser; nothing is sent.
- **PDFs:** rendered with a local Chromium browser (Edge autodetected). Override with
  the `CHROME_PATH` env var if Edge/Chrome lives elsewhere.
- **Daily check reminder** (replaces the Apps Script 8AM trigger):

  ```
  schtasks /Create /SC DAILY /ST 08:00 /TN "VegastarChecksReminder" /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\vegastar-erp && bin\rails checks:send_reminders"
  ```

- **Files** (receipts, photos, contracts, generated PDFs) are stored on local disk
  via ActiveStorage (`storage/`).
- Tests: `bin/rails test`
