# SP Bedana Rebrand + BOQ Upload / Nav Cleanup — Design

## Background

The app was built as "Vegastar ERP" for a multi-company operation (BOQ/project records could be
assigned to one of several companies, managed via a "Manage Companies" screen). The business is now
operating as a single company, SP Bedana, so the multi-company concept is being retired from the
UI and the app's branding is changing to match.

Deferred to a later pass (not in scope here): parsing BOQ data from the client's own BOM file,
using its "Detailed Breakdown" tab — blocked on the user obtaining a sample file.

## Scope

### 1. Rebrand to "SP Bedana"

Full rebrand — both what users see and internal naming (per user's explicit choice of "user-facing +
internal code names" over "user-facing only").

**User-facing:**
- Browser tab title / `<meta name="application-name">` (`app/views/layouts/application.html.erb`)
- Top-left nav logo + title, login screen brand text/title (`app/views/portal/index.html.erb`),
  including the `CLIENT_NAME` JS constant
- PWA manifest `name` / `description` (`app/views/pwa/manifest.json.erb`)
- Email subject lines in 5 mailers: `auth_mailer.rb`, `checks_mailer.rb`, `mrf_mailer.rb`,
  `po_mailer.rb`, `subcon_mailer.rb`
- `README.md` title and default-login example

**Internal code naming:**
- Ruby module `VegastarErp` → `SpBedanaErp` in `config/application.rb`. Confirmed via grep that
  nothing else in the codebase references `VegastarErp::`, so this is an isolated, low-risk rename.
- Sample/demo data domain `vegastar.local` → `spbedana.local` (`db/seeds.rb`, `lib/tasks/sample_data.rake`, README)
- `"Vegastar"` / `"Vegastar Construction"` sample company string values used as demo/test fixture
  data (`db/seeds.rb`, `lib/tasks/sample_data.rake`, `features/build_boq_approval.feature`,
  `features/step_definitions/build_boq_steps.rb`, `test/services/boq_ingestor_test.rb`) → renamed to
  the SP Bedana equivalent. Safe because these are plain string values compared against their own
  matching assertions, not app logic.
- Scheduled-task name in a comment (`lib/tasks/checks.rake`)

**Database rename** (per user's choice: "just recreate fresh"):
- Update `config/database.yml`: `vegastar_erp_development` → `sp_bedana_erp_development`,
  `vegastar_erp_test` → `sp_bedana_erp_test`
- Run `bin/rails db:create db:migrate db:seed` to create the newly-named databases
- **This does not migrate data from the old `vegastar_erp_*` databases** — those are simply
  abandoned (not dropped automatically). This was an explicit, informed choice since this is local
  dev data, not production.

**Explicitly out of scope:** renaming the project's own folder/git repo name, and the production
database on Railway (only local `config/database.yml` env blocks are touched for dev/test — the
`production` block reads `DATABASE_URL` from the environment and has no hardcoded name to change).

### 2. Remove "Assign Company" field from BOQ upload

- Remove the "Assign Company" `<select>` and its label from the **"Upload Excel File"** screen only
  (`id="assignCompany"` in `app/views/portal/index.html.erb`). The "Build BOQ" screen's own company
  field (`id="nboq-assignCompany"`) is left as-is — the user's request named "BOQ upload"
  specifically.
- Remove the corresponding required-field validation and payload wiring in `portal.js`
  (`~line 2168-2204`, the submit handler for the upload screen).
- The `company` value on new BOQ records from this screen is simply left blank going forward (per
  user's choice) — no backend schema change, no auto-fill default.

### 3. Remove "Vegastar" title, top-left

- Same edit as the rebrand's top-nav logo/title change in section 1 — the `.logo-section` block in
  `app/views/portal/index.html.erb` (`~line 161-165`). Called out separately here because it's an
  explicit checklist item, but implemented as part of section 1's rebrand pass.

### 4. Hide "Manage Companies" and "Manage Users" tabs

- These aren't top-level tabs today — `manage_hub.js` already consolidated the original "Manage
  Users", "Manage Data", and "Manage Companies" top-nav items into one "Manage" tab with three
  sub-tab pills (Users / Data / Companies).
- Per user's choice ("hide from navigation only"), the underlying `manage_users.js` and
  `manage_companies.js` code, controllers, and routes are left untouched — only reachability
  changes.
- Since hiding both Users and Companies sub-tabs leaves only "Data" (CSV import), `manage_hub.js`
  is adjusted to not build the "Manage" hub wrapper/pills at all in this case — instead the original
  "Manage Data" nav link is simply shown directly (as it would appear if the hub consolidation had
  never run for it), so the admin nav doesn't show a "Manage" dropdown/tab containing a single pill.

### 5. Logo integration

- User will place the provided logo file at `app/assets/images/logo.png` (or `.svg` if vector).
- Once present: swap the hardcoded `https://i.imgur.com/dhbq2a5.png` references (4 places in
  `app/views/portal/index.html.erb`) to the local asset via `asset_path`/`image_tag`, and replace
  `public/icon.png` (and `public/icon.svg` if a vector source is available) used for favicon /
  apple-touch-icon / PWA icon.
- Blocked until the user actually adds the file.

## Explicitly deferred / dropped

- **BOQ parsing from BOM "Detailed Breakdown" tab** — deferred; no sample file yet.
- **"+ Add Task"** — dropped from scope; user confirmed it wasn't meant to be on the list.

## Risks / manual steps called out to the user

- Local Postgres databases are recreated empty under new names; old `vegastar_erp_*` databases are
  abandoned in place, not dropped. User has been told this explicitly and chose it anyway.
