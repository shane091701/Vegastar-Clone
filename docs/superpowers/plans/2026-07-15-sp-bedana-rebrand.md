# SP Bedana Rebrand + BOQ Upload / Nav Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand this Rails app from "Vegastar (ERP)" to "SP Bedana" across every user-facing surface and internal code name, remove the now-unneeded "Assign Company" field from the BOQ upload screen, and hide the "Manage Companies"/"Manage Users" nav tabs without deleting their underlying code.

**Architecture:** This is a rename/removal pass over an existing server-rendered Rails app (ERB views + one big `portal.js`) plus small, targeted JS edits — no new subsystems. Tasks are grouped by the class of file they touch (Ruby config, ERB views, mailers, docs/seeds, tests/fixtures, then the two behavior changes) so each is independently reviewable and each ends with a concrete verification step.

**Tech Stack:** Ruby on Rails 8.1, PostgreSQL, vanilla JS (`app/assets/javascripts/portal.js` + small standalone admin-screen JS files), Minitest, Cucumber.

## Global Constraints

- Every visible "Vegastar" string becomes "SP Bedana" (see spec: `docs/superpowers/specs/2026-07-15-sp-bedana-rebrand-design.md`).
- Ruby module: `VegastarErp` → `SpBedanaErp`.
- Sample/demo email domain: `vegastar.local` → `spbedana.local`.
- Local dev/test Postgres DBs are recreated fresh under new names (`sp_bedana_erp_development` / `sp_bedana_erp_test`) — old `vegastar_erp_*` DBs are abandoned in place, not dropped. This was an explicit, informed user choice.
- **Excluded from the rename:** the lowercase `'vegastar'` string used in `portal.js` / `portal.css` as a CSS-class suffix for company-based row/select highlighting (`proj-hl-vegastar`, `company-highlight-vegastar`). That's a data-driven legacy multi-company feature keyed off whatever `company` value happens to be stored on old records — not app branding. Renaming it would just orphan the highlight for old data without anything upstream ever producing an "sp-bedana" company value (Assign Company now leaves `company` blank going forward). Leave it as-is.
- "Upload Excel File" BOQ screen's Assign Company field (`id="assignCompany"`) is removed. "Build BOQ" screen's own company field (`id="nboq-assignCompany"`) is untouched — the user's request named "BOQ upload" specifically.
- Manage Companies/Users: hide nav reachability only. Do not delete `manage_companies.js`, `manage_users.js`, their controllers, or routes.
- Logo file swap (Task I) is blocked until the user provides `app/assets/images/logo.png` (or `.svg`) — do not attempt it until that file exists.

---

### Task A: Rename Ruby module + recreate local databases

**Files:**
- Modify: `config/application.rb:21`
- Modify: `config/database.yml:14`, `config/database.yml:18`

**Interfaces:** None — this task has no consumers in later tasks; it's a standalone rename.

- [ ] **Step 1: Rename the module in `config/application.rb`**

Change:
```ruby
module VegastarErp
```
to:
```ruby
module SpBedanaErp
```

- [ ] **Step 2: Rename the database names in `config/database.yml`**

Change:
```yaml
development:
  <<: *default
  database: vegastar_erp_development

test:
  <<: *default
  database: vegastar_erp_test
```
to:
```yaml
development:
  <<: *default
  database: sp_bedana_erp_development

test:
  <<: *default
  database: sp_bedana_erp_test
```

- [ ] **Step 3: Recreate the databases and confirm the app boots**

Run:
```
bin/rails db:create db:migrate db:seed
bin/rails runner "puts SpBedanaErp::Application.name"
```
Expected: both databases are created without error, migrations run clean, seed output completes, and the runner command prints `SpBedanaErp::Application`.

- [ ] **Step 4: Commit**

```bash
git add config/application.rb config/database.yml
git commit -m "Rename app module to SpBedanaErp and recreate local DBs under new name"
```

---

### Task B: Rebrand the app shell (layout + PWA manifest)

**Files:**
- Modify: `app/views/layouts/application.html.erb:4,7`
- Modify: `app/views/pwa/manifest.json.erb:2,19`

**Interfaces:** None.

- [ ] **Step 1: Update the page title and app-name meta tag**

In `app/views/layouts/application.html.erb`, change:
```erb
    <title><%= content_for(:title) || "Vegastar Erp" %></title>
```
to:
```erb
    <title><%= content_for(:title) || "SP Bedana ERP" %></title>
```
and change:
```erb
    <meta name="application-name" content="Vegastar Erp">
```
to:
```erb
    <meta name="application-name" content="SP Bedana ERP">
```

- [ ] **Step 2: Update the PWA manifest**

In `app/views/pwa/manifest.json.erb`, change:
```json
  "name": "VegastarErp",
```
to:
```json
  "name": "SpBedanaErp",
```
and change:
```json
  "description": "VegastarErp.",
```
to:
```json
  "description": "SpBedanaErp.",
```

- [ ] **Step 3: Verify**

Boot the server and load the homepage:
```
bin/rails server -p 3099 &
curl -s http://localhost:3099/ | grep -i "SP Bedana"
kill %1
```
Expected: the curl output contains `SP Bedana` in the `<title>` tag; no `Vegastar` remains in the response for that page.

- [ ] **Step 4: Commit**

```bash
git add app/views/layouts/application.html.erb app/views/pwa/manifest.json.erb
git commit -m "Rebrand app shell (title, meta tags, PWA manifest) to SP Bedana"
```

---

### Task C: Rebrand the portal login screen and top nav

**Files:**
- Modify: `app/views/portal/index.html.erb:11,30-31,55-56,84,93,163-164`

**Interfaces:** None.

- [ ] **Step 1: Update the `CLIENT_NAME` JS constant**

Change:
```erb
    const CLIENT_NAME = "Vegastar";
```
to:
```erb
    const CLIENT_NAME = "SP Bedana";
```

- [ ] **Step 2: Update the auth-loading overlay branding (lines ~30-31)**

Change:
```erb
    <div class="lp-logo lp-logo-sm"><img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo"></div>
    <h3 class="lp-auth-title">Vegastar</h3>
```
to:
```erb
    <div class="lp-logo lp-logo-sm"><img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo"></div>
    <h3 class="lp-auth-title">SP Bedana</h3>
```
(the `img src` stays on the placeholder imgur URL for now — swapped in Task I once the logo file is provided)

- [ ] **Step 3: Update the left branding panel (lines ~55-56)**

Change:
```erb
      <div class="lp-logo"><img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo"></div>
      <h1 class="lp-brand-name">Vegastar</h1>
```
to:
```erb
      <div class="lp-logo"><img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo"></div>
      <h1 class="lp-brand-name">SP Bedana</h1>
```

- [ ] **Step 4: Update the form-header logo (line ~84) and email placeholder (line ~93)**

Change:
```erb
        <div class="lp-form-logo-sm"><img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo"></div>
```
to:
```erb
        <div class="lp-form-logo-sm"><img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo"></div>
```
Change:
```erb
        <input type="email" id="loginEmail" class="lp-input" placeholder="you@vegastar.com" required>
```
to:
```erb
        <input type="email" id="loginEmail" class="lp-input" placeholder="you@spbedana.com" required>
```

- [ ] **Step 5: Update the top nav logo/title (lines ~163-164)**

Change:
```erb
      <div class="logo-icon"><img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo"></div>
      <div class="logo-text">Vegastar</div>
```
to:
```erb
      <div class="logo-icon"><img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo"></div>
      <div class="logo-text">SP Bedana</div>
```

- [ ] **Step 6: Verify no "Vegastar" remains in this file**

Run: `grep -in vegastar app/views/portal/index.html.erb`
Expected: no output (empty).

- [ ] **Step 7: Commit**

```bash
git add app/views/portal/index.html.erb
git commit -m "Rebrand portal login screen and top nav to SP Bedana"
```

---

### Task D: Rebrand mailer subjects and email templates

**Files:**
- Modify: `app/mailers/auth_mailer.rb:5`
- Modify: `app/mailers/checks_mailer.rb:7`
- Modify: `app/mailers/mrf_mailer.rb:12,22`
- Modify: `app/mailers/po_mailer.rb:9`
- Modify: `app/mailers/subcon_mailer.rb:13`
- Modify: `app/views/auth_mailer/reset_password.html.erb:2`
- Modify: `app/views/checks_mailer/pending_digest.html.erb:3,32`
- Modify: `app/views/mrf_mailer/approval_result.html.erb:3,42`
- Modify: `app/views/mrf_mailer/new_request.html.erb:3,32`
- Modify: `app/views/po_mailer/dispatch.html.erb:7`
- Modify: `app/views/subcon_mailer/ready_to_pay.html.erb:6,35`
- Modify: `app/services/pdf_generator.rb:73-74`

**Interfaces:** None.

- [ ] **Step 1: Update mailer subject lines**

In `app/mailers/auth_mailer.rb`, change:
```ruby
    mail(to: user.email, subject: "Vegastar Portal - Password Reset Request")
```
to:
```ruby
    mail(to: user.email, subject: "SP Bedana Portal - Password Reset Request")
```

In `app/mailers/checks_mailer.rb`, change:
```ruby
         subject: "[Checks Due] #{due_checks.length} check(s) require deposit — Vegastar")
```
to:
```ruby
         subject: "[Checks Due] #{due_checks.length} check(s) require deposit — SP Bedana")
```

In `app/mailers/mrf_mailer.rb`, change:
```ruby
         subject: "#{subject_prefix} #{project_name} — Action Required | Vegastar")
```
to:
```ruby
         subject: "#{subject_prefix} #{project_name} — Action Required | SP Bedana")
```
and change:
```ruby
    mail(to: requestor_email, subject: "[MRF #{status_word}] #{request_id} — Vegastar")
```
to:
```ruby
    mail(to: requestor_email, subject: "[MRF #{status_word}] #{request_id} — SP Bedana")
```

In `app/mailers/po_mailer.rb`, change:
```ruby
    mail(to: to_email, subject: "Purchase Order [#{po_code}] - Vegastar")
```
to:
```ruby
    mail(to: to_email, subject: "Purchase Order [#{po_code}] - SP Bedana")
```

In `app/mailers/subcon_mailer.rb`, change:
```ruby
         subject: "[Vegastar] Subcontractor milestone(s) ready to pay — #{context[:subName]}")
```
to:
```ruby
         subject: "[SP Bedana] Subcontractor milestone(s) ready to pay — #{context[:subName]}")
```

- [ ] **Step 2: Update email body templates**

In `app/views/auth_mailer/reset_password.html.erb`, change:
```erb
You requested a password reset for the Vegastar Portal.<br><br>
```
to:
```erb
You requested a password reset for the SP Bedana Portal.<br><br>
```

In `app/views/checks_mailer/pending_digest.html.erb`, change:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏦 Vegastar &mdash; Checks Due for Deposit</h2>
```
to:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏦 SP Bedana &mdash; Checks Due for Deposit</h2>
```
and change:
```erb
      This is an automated notification from the Vegastar ERP portal.
```
to:
```erb
      This is an automated notification from the SP Bedana ERP portal.
```

In `app/views/mrf_mailer/approval_result.html.erb`, change:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏗️ Vegastar &mdash; MRF <%= @is_approved ? raw("APPROVED &#x2705;") : raw("REJECTED &#x274C;") %></h2>
```
to:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏗️ SP Bedana &mdash; MRF <%= @is_approved ? raw("APPROVED &#x2705;") : raw("REJECTED &#x274C;") %></h2>
```
and change:
```erb
      This is an automated notification from the Vegastar ERP portal.
```
to:
```erb
      This is an automated notification from the SP Bedana ERP portal.
```

In `app/views/mrf_mailer/new_request.html.erb`, change:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏗️ Vegastar &mdash; New <%= @type_label %></h2>
```
to:
```erb
    <h2 style="margin:0;font-size:1.2rem;">🏗️ SP Bedana &mdash; New <%= @type_label %></h2>
```
and change:
```erb
      This is an automated notification from the Vegastar ERP portal.
```
to:
```erb
      This is an automated notification from the SP Bedana ERP portal.
```

In `app/views/po_mailer/dispatch.html.erb`, change:
```erb
  <p><b><%= @signer_name %></b><br>Vegastar</p>
```
to:
```erb
  <p><b><%= @signer_name %></b><br>SP Bedana</p>
```

In `app/views/subcon_mailer/ready_to_pay.html.erb`, change:
```erb
      <div style="color:#e8a820;font-weight:700;font-size:1.05rem;letter-spacing:.02em;">Vegastar</div>
```
to:
```erb
      <div style="color:#e8a820;font-weight:700;font-size:1.05rem;letter-spacing:.02em;">SP Bedana</div>
```
and change:
```erb
        Automated notification from the Vegastar ERP Portal. Navigate to Subcontractor AP to process payment.
```
to:
```erb
        Automated notification from the SP Bedana ERP Portal. Navigate to Subcontractor AP to process payment.
```

- [ ] **Step 3: Update the generated-PDF branding text**

In `app/services/pdf_generator.rb`, change:
```ruby
        <img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo" style="max-height: 70px; width: auto; margin-bottom: 10px;"
             onerror="this.outerHTML='<h1 style=&quot;color:#f8b400;margin:0;&quot;>Vegastar</h1>'">
```
to:
```ruby
        <img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo" style="max-height: 70px; width: auto; margin-bottom: 10px;"
             onerror="this.outerHTML='<h1 style=&quot;color:#f8b400;margin:0;&quot;>SP Bedana</h1>'">
```
(the `img src` stays on the placeholder imgur URL for now — swapped in Task I)

- [ ] **Step 4: Verify**

Run: `grep -rin vegastar app/mailers app/views/auth_mailer app/views/checks_mailer app/views/mrf_mailer app/views/po_mailer app/views/subcon_mailer app/services/pdf_generator.rb`
Expected: no output (empty).

Then run the existing mailer/PDF tests if any exist:
```
bin/rails test test/mailers test/services/pdf_generator_test.rb
```
Expected: all pass (if these test paths don't exist, skip — there's no mailer test suite to break either way).

- [ ] **Step 5: Commit**

```bash
git add app/mailers app/views/auth_mailer app/views/checks_mailer app/views/mrf_mailer app/views/po_mailer app/views/subcon_mailer app/services/pdf_generator.rb
git commit -m "Rebrand mailer subjects, email templates, and PDF header to SP Bedana"
```

---

### Task E: Rebrand seeds, sample data, docs, and README

**Files:**
- Modify: `db/seeds.rb:30,47,56-61`
- Modify: `lib/tasks/sample_data.rake` (all `@vegastar.local` occurrences, and `company: "Vegastar Construction"` occurrences)
- Modify: `lib/tasks/checks.rake:3-4`
- Modify: `README.md:1,24,34`
- Modify: `docs/CUCUMBER_SETUP.md:1,185`
- Move + modify: `docs/VEGASTAR_ERP_MANUAL_FLOW.md` → `docs/SP_BEDANA_ERP_MANUAL_FLOW.md`
- Modify: `app/services/managed_data_types.rb:124`

**Interfaces:** None.

- [ ] **Step 1: Update `db/seeds.rb`**

Change:
```ruby
User.find_or_create_by!(email: "admin@vegastar.local") do |u|
```
to:
```ruby
User.find_or_create_by!(email: "admin@spbedana.local") do |u|
```

Change:
```ruby
["Krone Konstruct", "Vegastar", "CT"].each do |name|
```
to:
```ruby
["Krone Konstruct", "SP Bedana", "CT"].each do |name|
```

Change:
```ruby
    "accountant"       => "accountant@vegastar.local",
    "approver"         => "approver@vegastar.local",
    "site engineer"    => "site.engineer@vegastar.local",
    "project engineer" => "project.engineer@vegastar.local",
    "encoder"          => "encoder@vegastar.local",
    "subcontractor"    => "subcontractor@vegastar.local"
```
to:
```ruby
    "accountant"       => "accountant@spbedana.local",
    "approver"         => "approver@spbedana.local",
    "site engineer"    => "site.engineer@spbedana.local",
    "project engineer" => "project.engineer@spbedana.local",
    "encoder"          => "encoder@spbedana.local",
    "subcontractor"    => "subcontractor@spbedana.local"
```

- [ ] **Step 2: Update `lib/tasks/sample_data.rake`**

This file has ~24 occurrences of `@vegastar.local` (email domains) and 3 occurrences of `Vegastar Construction` (sample company name, both as `company: "Vegastar Construction"` and `"company" => "Vegastar Construction"`). All are the same literal strings repeated — run an exact, scoped find/replace on just this one file:

```bash
sed -i 's/@vegastar\.local/@spbedana.local/g; s/Vegastar Construction/SP Bedana Construction/g' lib/tasks/sample_data.rake
```

- [ ] **Step 3: Update `lib/tasks/checks.rake`**

Change:
```ruby
#   schtasks /Create /SC DAILY /ST 08:00 /TN "VegastarChecksReminder" ^
#     /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\vegastar-erp && bin\rails checks:send_reminders"
```
to:
```ruby
#   schtasks /Create /SC DAILY /ST 08:00 /TN "SpBedanaChecksReminder" ^
#     /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\sp-bedana-erp && bin\rails checks:send_reminders"
```

- [ ] **Step 4: Update `README.md`**

Change:
```markdown
# Vegastar ERP (Ruby on Rails)
```
to:
```markdown
# SP Bedana ERP (Ruby on Rails)
```

Change:
```markdown
**Default login:** `admin@vegastar.local` / `ChangeMe123!` (change it after first login).
```
to:
```markdown
**Default login:** `admin@spbedana.local` / `ChangeMe123!` (change it after first login).
```

Change:
```markdown
  schtasks /Create /SC DAILY /ST 08:00 /TN "VegastarChecksReminder" /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\vegastar-erp && bin\rails checks:send_reminders"
```
to:
```markdown
  schtasks /Create /SC DAILY /ST 08:00 /TN "SpBedanaChecksReminder" /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\sp-bedana-erp && bin\rails checks:send_reminders"
```

- [ ] **Step 5: Rename and update the manual-flow doc**

```bash
git mv docs/VEGASTAR_ERP_MANUAL_FLOW.md docs/SP_BEDANA_ERP_MANUAL_FLOW.md
```

In the newly-moved `docs/SP_BEDANA_ERP_MANUAL_FLOW.md`, change:
```markdown
# Vegastar ERP — Manual Testing Guide: MRF → Delivery Flow
```
to:
```markdown
# SP Bedana ERP — Manual Testing Guide: MRF → Delivery Flow
```

- [ ] **Step 6: Update references to the renamed doc and the repo name**

In `docs/CUCUMBER_SETUP.md`, change:
```markdown
# Cucumber (Ruby) Setup Guide — vegastar-erp
```
to:
```markdown
# Cucumber (Ruby) Setup Guide — sp-bedana-erp
```
and change:
```markdown
See `VEGASTAR_ERP_MANUAL_FLOW.md` for the manual/business-flow explanation
```
to:
```markdown
See `SP_BEDANA_ERP_MANUAL_FLOW.md` for the manual/business-flow explanation
```

In `app/services/managed_data_types.rb`, change:
```ruby
      # a matching project_code string (see docs/VEGASTAR_ERP_MANUAL_FLOW.md).
```
to:
```ruby
      # a matching project_code string (see docs/SP_BEDANA_ERP_MANUAL_FLOW.md).
```

- [ ] **Step 7: Verify**

Run: `grep -rin vegastar db/seeds.rb lib/tasks README.md docs app/services/managed_data_types.rb`
Expected: no output (empty).

Then run:
```
bin/rails db:seed
bin/rails sample_data:load
```
Expected: both run without error against the newly-created `sp_bedana_erp_development` database from Task A.

- [ ] **Step 8: Commit**

```bash
git add db/seeds.rb lib/tasks README.md docs app/services/managed_data_types.rb
git commit -m "Rebrand seeds, sample data, docs, and README to SP Bedana"
```

---

### Task F: Rebrand test/feature fixture company values

**Files:**
- Modify: `test/controllers/api/boq_builder_controller_test.rb:5`
- Modify: `test/controllers/api/companies_controller_test.rb:9,17,30,35,44,51`
- Modify: `test/controllers/api/rtb_and_pricing_test.rb:8`
- Modify: `test/services/boq_ingestor_test.rb:17,35,89`
- Modify: `features/build_boq_approval.feature:13,20,28,34`
- Modify: `features/step_definitions/build_boq_steps.rb:53`

**Interfaces:** None — these are self-contained test files (input value and its own assertion both change together).

- [ ] **Step 1: Update `test/controllers/api/boq_builder_controller_test.rb`**

Change:
```ruby
    "project" => { "code" => "NB1", "customerName" => "Juan", "company" => "Vegastar",
```
to:
```ruby
    "project" => { "code" => "NB1", "customerName" => "Juan", "company" => "SP Bedana",
```

- [ ] **Step 2: Update `test/controllers/api/companies_controller_test.rb`**

Change line 9:
```ruby
    AssignCompany.create!(name: "Vegastar")
```
to:
```ruby
    AssignCompany.create!(name: "SP Bedana")
```
Change line 17:
```ruby
    assert_equal ["CT", "Vegastar"], JSON.parse(response.body)["companies"]
```
to:
```ruby
    assert_equal ["CT", "SP Bedana"], JSON.parse(response.body)["companies"]
```
Change line 30:
```ruby
    assert_equal ["CT", "Krone Konstruct", "Vegastar"], JSON.parse(response.body)["companies"]
```
to:
```ruby
    assert_equal ["CT", "Krone Konstruct", "SP Bedana"], JSON.parse(response.body)["companies"]
```
Change line 35 — this test checks that a name which is a *case-insensitive* duplicate of an existing company is rejected, so the replacement must still differ from `"SP Bedana"` only by case (not by also dropping the space, which would make it a different string and defeat the point of the test):
```ruby
    post "/api/createCompany", params: { args: ["vegastar"] }, as: :json
```
to:
```ruby
    post "/api/createCompany", params: { args: ["sp bedana"] }, as: :json
```
This test only asserts `assert_response :unprocessable_entity` and the error message afterward — it does not assert a companies list, so no paired list-assertion needs updating here.

Change line 44:
```ruby
    assert_equal ["CT Builders", "Vegastar"], JSON.parse(response.body)["companies"]
```
to:
```ruby
    assert_equal ["CT Builders", "SP Bedana"], JSON.parse(response.body)["companies"]
```
Change line 51:
```ruby
    assert_equal ["Vegastar"], JSON.parse(response.body)["companies"]
```
to:
```ruby
    assert_equal ["SP Bedana"], JSON.parse(response.body)["companies"]
```

- [ ] **Step 3: Update `test/controllers/api/rtb_and_pricing_test.rb`**

Change:
```ruby
    Project.create!(code: "PRJ1", customer_name: "Juan", company: "Vegastar", quoted_cost: 1_000_000)
```
to:
```ruby
    Project.create!(code: "PRJ1", customer_name: "Juan", company: "SP Bedana", quoted_cost: 1_000_000)
```

- [ ] **Step 4: Update `test/services/boq_ingestor_test.rb`**

Change line 17:
```ruby
    result = BoqIngestor.ingest_rows(SAMPLE_ROWS.map(&:dup), "AR BOM", "PRJ1", "Vegastar", "boq.xlsx")
```
to:
```ruby
    result = BoqIngestor.ingest_rows(SAMPLE_ROWS.map(&:dup), "AR BOM", "PRJ1", "SP Bedana", "boq.xlsx")
```
Change line 35:
```ruby
    assert_equal "Vegastar", concrete.company
```
to:
```ruby
    assert_equal "SP Bedana", concrete.company
```
Change line 89:
```ruby
    BoqIngestor.ingest_rows(rows, "AR BOM", "PRJ-MULTI", "Vegastar", "boq.xlsx")
```
to:
```ruby
    BoqIngestor.ingest_rows(rows, "AR BOM", "PRJ-MULTI", "SP Bedana", "boq.xlsx")
```

- [ ] **Step 5: Update `features/build_boq_approval.feature` and its step definition**

In `features/build_boq_approval.feature`, replace each of the 4 occurrences of `company "Vegastar"` with `company "SP Bedana"` (lines 13, 20, 28, 34).

In `features/step_definitions/build_boq_steps.rb`, change:
```ruby
  payload = build_native_boq_payload(project_code, "Juan Dela Cruz", "Vegastar", [
```
to:
```ruby
  payload = build_native_boq_payload(project_code, "Juan Dela Cruz", "SP Bedana", [
```

- [ ] **Step 6: Run the affected Ruby test suites**

Run:
```
bin/rails test test/controllers/api/boq_builder_controller_test.rb test/controllers/api/companies_controller_test.rb test/controllers/api/rtb_and_pricing_test.rb test/services/boq_ingestor_test.rb
```
Expected: all pass.

- [ ] **Step 7: Run the affected Cucumber feature**

Run: `bundle exec cucumber features/build_boq_approval.feature`
Expected: all scenarios pass.

- [ ] **Step 8: Commit**

```bash
git add test/controllers/api/boq_builder_controller_test.rb test/controllers/api/companies_controller_test.rb test/controllers/api/rtb_and_pricing_test.rb test/services/boq_ingestor_test.rb features/build_boq_approval.feature features/step_definitions/build_boq_steps.rb
git commit -m "Rebrand test/feature fixture company values to SP Bedana"
```

---

### Task G: Remove the Assign Company field from the BOQ upload screen

**Files:**
- Modify: `app/views/portal/index.html.erb:970-977`
- Modify: `app/assets/javascripts/portal.js:2166-2168,2178-2181,2204,2287`
- Modify: `app/assets/javascripts/manage_companies.js:19-21`

**Interfaces:**
- Consumes: none.
- Produces: the `startUpload()` submit handler in `portal.js` now sends `company: ''` for every new BOQ upload from this screen (matches the user's "leave it blank" decision from the spec) — this is what Task H and any future work touching this payload should expect.

- [ ] **Step 1: Remove the field markup**

In `app/views/portal/index.html.erb`, delete this block entirely (lines ~970-977):
```erb
        <div class="row g-3 mb-3">
          <div class="col-md-12">
            <label class="form-label fw-bold small text-muted">Assign Company <span class="text-danger">*</span></label>
            <select id="assignCompany" class="form-select">
              <option value="">— Select Company —</option>
            </select>
          </div>
        </div>

```

- [ ] **Step 2: Remove the field's JS wiring in `portal.js`**

Change:
```javascript
  const projectCode   = document.getElementById('projectCode').value.trim();
  const customerName  = document.getElementById('customerName').value.trim();
  const assignCompany = document.getElementById('assignCompany').value;
  const btn    = document.getElementById('uploadBtn');
```
to:
```javascript
  const projectCode   = document.getElementById('projectCode').value.trim();
  const customerName  = document.getElementById('customerName').value.trim();
  const assignCompany = '';
  const btn    = document.getElementById('uploadBtn');
```

Remove the required-field check:
```javascript
  if (!assignCompany) {
    updateStatus('Please select an Assigned Company before uploading.', 'text-danger');
    return;
  }

```

Remove the now-dead clear-on-reset line:
```javascript
  document.getElementById('assignCompany').value = '';
```
(delete this line entirely — the element no longer exists, so leaving it would throw `Cannot read properties of null` the next time the upload form resets)

Leave `company: assignCompany,` at (what was) line 2204 as-is — it now evaluates to `company: ''`, matching the "leave it blank" decision.

- [ ] **Step 3: Drop `assignCompany` from `manage_companies.js`'s dropdown list**

Change:
```javascript
  // Every screen with an Assign Company dropdown -- add more IDs here if
  // another one is added later.
  var DROPDOWN_IDS = ["assignCompany", "nboq-assignCompany"];
```
to:
```javascript
  // Every screen with an Assign Company dropdown -- add more IDs here if
  // another one is added later.
  var DROPDOWN_IDS = ["nboq-assignCompany"];
```

- [ ] **Step 4: Verify**

Run: `grep -n "assignCompany'" app/assets/javascripts/portal.js` (note: this intentionally still matches `nboq-assignCompany` references — confirm every remaining hit is prefixed `nboq-`, and that no bare `'assignCompany'` remains).

Then manually smoke-test: start the app (`bin/rails server`), log in, open the "Upload Excel File" BOQ screen, confirm no "Assign Company" field is shown, and complete an upload with a Project Code + Customer Name + file to confirm it still submits successfully.

- [ ] **Step 5: Commit**

```bash
git add app/views/portal/index.html.erb app/assets/javascripts/portal.js app/assets/javascripts/manage_companies.js
git commit -m "Remove Assign Company field from the BOQ upload screen"
```

---

### Task H: Hide the Manage Companies / Manage Users nav tabs

**Files:**
- Modify: `app/assets/javascripts/manage_hub.js` (full rewrite)

**Interfaces:**
- Consumes: `manage_users.js` and `manage_companies.js` each still build their own nav link (`#nav-manage-users`, `#nav-manage-companies`) and section (`#section-manage-users`, `#section-manage-companies`) exactly as before — untouched.
- Produces: nothing consumed elsewhere; this file's only job is hiding those two nav links after they're built. `#nav-csv-import` ("Manage Data") is left completely alone and keeps working exactly as it did before hub consolidation existed.

- [ ] **Step 1: Replace `manage_hub.js`'s consolidation logic with a simple hide**

Replace the entire contents of `app/assets/javascripts/manage_hub.js` with:
```javascript
// Hides the admin-only "Manage Users" and "Manage Companies" nav links.
// manage_users.js / manage_companies.js still build these links and their
// sections exactly as before -- this just makes them unreachable from the
// nav. "Manage Data" (csv_import.js) is untouched and stays directly
// reachable. Runs after both pieces exist since each is built asynchronously
// on DOMContentLoaded by its own module (see script include order in
// index.html.erb).
(function () {
  var HIDDEN_NAV_IDS = ["nav-manage-users", "nav-manage-companies"];

  function allPiecesReady() {
    return HIDDEN_NAV_IDS.every(function (id) { return document.getElementById(id); });
  }

  function init() {
    HIDDEN_NAV_IDS.forEach(function (id) {
      var nav = document.getElementById(id);
      if (nav) nav.style.display = "none";
    });
  }

  var attempts = 0;
  var interval = setInterval(function () {
    attempts++;
    if (allPiecesReady()) {
      clearInterval(interval);
      init();
    } else if (attempts > 50) {
      clearInterval(interval); // give up quietly after ~5s
    }
  }, 100);
})();
```

- [ ] **Step 2: Verify**

Confirm no other file references the old hub-only DOM ids (`nav-manage`, `section-manage`, `manage-hub-tab-*`):
Run: `grep -rn "nav-manage\"\|section-manage\"\|manage-hub" app/assets/javascripts app/views`
Expected: no hits outside `manage_hub.js` itself (already confirmed during planning — this step just re-confirms after the edit).

Then manually smoke-test: start the app, log in as an admin user, confirm "Manage Users" and "Manage Companies" no longer appear anywhere in the nav, and confirm "Manage Data" still appears and works exactly as before (loads the CSV import screen).

- [ ] **Step 3: Commit**

```bash
git add app/assets/javascripts/manage_hub.js
git commit -m "Hide Manage Users and Manage Companies from nav, keep Manage Data direct"
```

---

### Task I (blocked — do not start until the user provides the logo file): Swap in the SP Bedana logo

**Files:**
- Modify: `app/views/portal/index.html.erb` (4 `img src` occurrences, same lines touched in Task C)
- Modify: `app/services/pdf_generator.rb:73` (`img src`, same line touched in Task D)
- Replace: `public/icon.png`
- Replace or add: `public/icon.svg` (only if the user's file is vector)

**Interfaces:** None — purely swaps a URL/asset, no behavior change.

- [ ] **Step 1: Confirm the file exists**

Run: `ls app/assets/images/` — expect to see `logo.png` (or `logo.svg`) placed there by the user. **Do not proceed past this step until it exists.**

- [ ] **Step 2: Replace the 4 hardcoded imgur URLs in `app/views/portal/index.html.erb`**

Each of the 4 `<img src="https://i.imgur.com/dhbq2a5.png" alt="SP Bedana Logo">` occurrences (from Task C: the auth-loading overlay, the left branding panel, the form-header logo, and the top-nav logo) becomes:
```erb
<img src="<%= asset_path('logo.png') %>" alt="SP Bedana Logo">
```
(use the actual extension the user provided — `.png` or `.svg`)

- [ ] **Step 3: Replace the imgur URL in `app/services/pdf_generator.rb`**

`logo_header_html` (`app/services/pdf_generator.rb:70-78`) is a plain Ruby heredoc, not an ERB template, and `render_pdf` (line 48-57) writes this HTML to a temp file and loads it into Chromium via a `file://` URL — there is no Rails server backing that origin, so a normal `asset_path`/`/assets/...` URL would not resolve and the logo would silently fail to load in generated PDFs. Embed the image as a base64 data URI instead, which works regardless of how the HTML is loaded.

Add `require "base64"` near the top of the file if not already loaded elsewhere (Ruby's `Base64` is in the standard library and this file doesn't currently require it), then change:
```ruby
  # Port of getPdfLogoHeaderHtml_ — Source/code.js:2245
  def self.logo_header_html(doc_title)
    <<~HTML
      <div style="text-align:center; margin-bottom:20px;">
        <img src="https://i.imgur.com/dhbq2a5.png" alt="Vegastar Logo" style="max-height: 70px; width: auto; margin-bottom: 10px;"
             onerror="this.outerHTML='<h1 style=&quot;color:#f8b400;margin:0;&quot;>Vegastar</h1>'">
        <p style="margin:5px 0; font-weight:bold; text-transform:uppercase;">#{doc_title}</p>
      </div>
    HTML
  end
```
to (adjust `logo.png`/`image/png` to whatever extension/mime type the user's actual logo file turns out to be):
```ruby
  LOGO_DATA_URI = begin
    path = Rails.root.join("app/assets/images/logo.png")
    "data:image/png;base64,#{Base64.strict_encode64(File.binread(path))}"
  end

  # Port of getPdfLogoHeaderHtml_ — Source/code.js:2245
  def self.logo_header_html(doc_title)
    <<~HTML
      <div style="text-align:center; margin-bottom:20px;">
        <img src="#{LOGO_DATA_URI}" alt="SP Bedana Logo" style="max-height: 70px; width: auto; margin-bottom: 10px;"
             onerror="this.outerHTML='<h1 style=&quot;color:#f8b400;margin:0;&quot;>SP Bedana</h1>'">
        <p style="margin:5px 0; font-weight:bold; text-transform:uppercase;">#{doc_title}</p>
      </div>
    HTML
  end
```
Note `LOGO_DATA_URI` is computed once at class-load time (constants run their `begin...end` immediately), so it reads the logo file from disk a single time rather than on every PDF generated.

- [ ] **Step 4: Replace the favicon**

Copy the user's logo file over `public/icon.png` (resize/export a reasonably small favicon-sized version if the source is large — check the current `public/icon.png` dimensions first with a quick image-info check so the replacement isn't absurdly oversized for a favicon). If the user's file is vector (`.svg`), also replace `public/icon.svg`; otherwise leave `public/icon.svg` as-is.

- [ ] **Step 5: Verify**

Start the app, load the login page and the main app shell, confirm the new logo renders in all 4 spots plus the browser tab favicon. Generate one PDF (e.g. a PO) and confirm the new logo appears there too.

- [ ] **Step 6: Commit**

```bash
git add app/views/portal/index.html.erb app/services/pdf_generator.rb public/icon.png
git commit -m "Swap in the SP Bedana logo across login screen, top nav, and PDFs"
```
