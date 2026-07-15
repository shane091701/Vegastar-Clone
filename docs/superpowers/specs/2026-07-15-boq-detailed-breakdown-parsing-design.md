# BOQ Parsing: Support the Real "Detailed Breakdown" Excel Layout — Design

## Background

The BOQ upload feature (`BoqIngestor`) was built against a simplified, single-header-row
column layout that only exists in this app's own test fixtures
(`test/services/boq_ingestor_test.rb`). The user's actual client BOM file
(`tmp/sample_boq.xls`, inspected directly) has 4 tabs: "bid comparison", "detailed
breakdown", "Sheet1", and "Bar chart_vigor". Both "detailed breakdown" and "Sheet1" share
a real-world layout that differs from the app's assumed layout in three ways: it's a
legacy binary `.xls` file (not `.xlsx`), it has a two-row header (parent header + sub-header
for the Materials/Labor cost blocks), and it has an extra "SPECS" column and a leading blank
column that shift every subsequent column's position.

## Confirmed facts (verified against the real file, not assumed)

- **File format:** `tmp/sample_boq.xls` is a genuine OLE2 Compound Document (legacy Excel
  97-2003 binary format), not a renamed `.xlsx`. The app's current parser (`roo` gem
  `~> 2.10`) only supports `.xlsx`/`.xlsm`/`.ods`/`.csv` — opening this file today raises
  `ArgumentError: Can't detect the type of ... .xls`, before any sheet/column logic even
  runs.
- **The `spreadsheet` gem can open it.** Verified locally: `Spreadsheet.open(path)` lists
  all 4 sheet names and reads cell values. Formula cells (e.g. computed "amount" columns)
  come back as `Spreadsheet::Formula` objects whose `.value` method returns the cached
  calculated result (verified: a cell with formula `=D17*G17` returned `.value == 15000.0`,
  matching the row's quantity × unit cost).
- **Sheet selection already works correctly for this file.** `BoqIngestor.find_boq_sheet_name`
  already searches for a sheet name containing "DETAILED" (among other patterns) before
  falling back to the first sheet. "detailed breakdown" (case-insensitive contains
  "DETAILED") is the second sheet checked and matches — no change needed here once the file
  can be opened at all.
- **The real column layout (verified against "detailed breakdown", row 7 = parent header,
  row 8 = sub-header, 0-indexed columns):**
  - Col 0: blank spacer
  - Col 1: phase/item number (e.g. "1.0", "PP-01")
  - Col 2: Description
  - Col 3: Specs (no equivalent field in `BoqItem` — read but not stored)
  - Col 4: Quantity
  - Col 5: Unit
  - Col 6: Direct Materials Cost → Unit Cost (sub-header)
  - Col 7: Direct Materials Cost → amount (sub-header) — material amount
  - Col 8: Direct Labor Cost → Unit Cost (sub-header)
  - Col 9: Direct Labor Cost → amount (sub-header) — labor amount
  - Col 10: "Direct" (row 7) + "L & M Cost" (row 8) — a subtotal column
  - Col 11: TOTAL
- **TOTAL and "Direct L&M Cost" are mathematically identical**, and both equal
  `material_amount + labor_amount`, verified across ~10 real line-item rows (e.g. row 29:
  21,600 + 9,720 = 31,320, matching both the L&M Cost and TOTAL cells exactly). `BoqItem`
  has no separate "L&M cost" field, so col 10 is read-but-discarded; col 11 (TOTAL) maps to
  `total_cost`.
- **Header cell text uses letter-spacing for visual effect** (e.g. `"D E S C R I P T I O N"`,
  not `"DESCRIPTION"`) in places, and the anchor column ("QTY"/"QUANTITY") is NOT always in
  column C — it's column E (index 4) in this layout vs. column C (index 2) in the app's
  existing simple/test-fixture layout.
- **The existing "simple" layout is not hypothetical** — it's what
  `test/services/boq_ingestor_test.rb`'s `SAMPLE_ROWS` and the Cucumber feature
  `features/build_boq_approval.feature` already exercise, and it must keep working
  unchanged (single header row: `ITEM, DESCRIPTION, QTY, UNIT, U/C MAT, TOTAL MAT, U/C
  LABOR, TOTAL LABOR, TOTAL`).
- **The upload screen already has a "See expected file format" guide.**
  `app/assets/javascripts/upload_format_guides.js` renders a modal next to the BOQ file
  input (`#fileInput`) showing an example table of the currently-documented simple layout.
  It only documents the simple layout today — needs a second example added for the
  detailed layout so it stays accurate.
- **The file input already advertises `.xls` support** (`accept=".xlsx, .xls"` in
  `app/views/portal/index.html.erb:1041`) even though the backend can't parse it today —
  this feature closes that pre-existing gap rather than opening a new one.

## Scope

### 1. Add legacy `.xls` support

- Add `gem "spreadsheet", "~> 1.3"` to the `Gemfile` (top-level, alongside `roo` — needed in
  all environments since real uploads happen in production).
- In `BoqIngestor.read_workbook`, branch on file extension: `.xls` → open via
  `Spreadsheet.open`, everything else → existing `Roo::Spreadsheet.open` path unchanged.
- Normalize both libraries' row output into a single plain-value format before handing rows
  to `ingest_rows`: for each cell, if it responds to `:value` (covers
  `Spreadsheet::Formula`), call `.value`; otherwise use the cell as-is. This avoids
  gem-specific branching inside the parsing logic itself.

### 2. Recognize two known header/column layouts

- Broaden the header-row search: instead of checking only column C (index 2) for
  `QTY_HEADERS`, scan the *entire* row for a cell matching `QTY_HEADERS` (after stripping
  internal whitespace and upcasing, to tolerate letter-spaced headers like
  `"Q T Y"`/`"D E S C R I P T I O N"` if they occur — verified the sample file uses this
  style for some titles).
- Whichever column index the QTY match lands in determines which of two known layouts to
  use:
  - **Column index 2 → "simple" layout** (today's existing behavior, unchanged): phase
    marker = col 0, item = col 1, qty = col 2, uom = col 3, unit_material_cost = col 4,
    total_material = col 5, unit_labor_cost = col 6, total_labor = col 7, total_cost = col 8.
  - **Column index 4 → "detailed" layout** (new): phase marker = col 1, item = col 2, specs
    = col 3 (ignored), qty = col 4, uom = col 5, unit_material_cost = col 6, total_material
    = col 7, unit_labor_cost = col 8, total_labor = col 9, (col 10 ignored), total_cost =
    col 11.
  - **Any other column index → raise a clear error** ("Unrecognized column layout — QTY
    found in column X, expected column C or E") rather than silently guessing at a
    financial data mapping the app has never seen.
- The phase/scope-detection regexes (`PHASE_ROW`, `SCOPE_ROW`) and the "skip TOTAL/SUB-TOTAL
  rows" logic operate on whichever columns the active layout maps to `item`/`qty` — no
  change to the regex patterns themselves, just which column index they're applied to.

### 3. Update the "See expected file format" guide

- Add a second entry (or extend the existing one) in
  `app/assets/javascripts/upload_format_guides.js`'s `GUIDES`/example table to show the
  detailed layout: columns A through L, the two-row header (parent + Unit Cost/amount
  sub-header), the SPECS column, and a note that either layout is auto-detected by where
  the QTY/QUANTITY header cell lands.

## Explicitly out of scope

- The "bid comparison" and "Bar chart_vigor" tabs — the user's task only asked for the
  "detailed breakdown" tab; these aren't touched.
- Any markup/OCM/profit calculation — TOTAL in the source file already equals
  material + labor amount with no markup layered in at the line-item level; the app just
  stores what the file already computes.
- Generalizing to arbitrary future column layouts beyond the two now-confirmed real
  examples (simple + detailed) — if a third real layout shows up later, it gets its own
  follow-up task once actually seen, not speculative support now.

## Risks / things to verify during implementation

- Confirm `Roo::Excelx` (used for `.xlsx` uploads) already resolves formula cells to their
  cached calculated value directly (no `.value` wrapper needed) — if not, the
  extension-based normalization step needs to handle that case too.
- The `spreadsheet` gem is old and lightly maintained; pin a version range and note this as
  a known tradeoff of supporting legacy `.xls` at all (this was an explicit, informed user
  choice over asking the client to re-save as `.xlsx`).
