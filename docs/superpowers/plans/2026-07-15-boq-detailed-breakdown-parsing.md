# BOQ Detailed-Breakdown Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `BoqIngestor` correctly parse the client's real BOM file — a legacy `.xls`
workbook whose "detailed breakdown"/"Sheet1" tabs use a two-row-header, 12-column layout —
while keeping the existing simple 9-column layout (used by this app's own tests) working
unchanged, and keep the upload screen's format-guide popup accurate for both.

**Architecture:** `BoqIngestor` gains a small "layout" concept: the header-row search now
scans an entire row (not a fixed column) for the QTY/QUANTITY anchor cell, and whichever
column it lands in selects one of two known column-offset tables. A new `.xls` code path
(via the `spreadsheet` gem) is normalized to the same plain-array-of-values shape the
existing `roo`-based `.xlsx` path already produces, so the rest of the parsing logic is
format-agnostic. No new files — one service file, one Gemfile line, one JS file, plus
tests.

**Tech Stack:** Ruby on Rails, `roo` gem (existing, `.xlsx`/`.xlsm`/`.ods`/`.csv`),
`spreadsheet` gem (new, legacy `.xls`), Minitest.

## Global Constraints

- The existing "simple" layout (`ITEM, DESCRIPTION, QTY, UNIT, U/C MAT, TOTAL MAT, U/C
  LABOR, TOTAL LABOR, TOTAL`, QTY anchor in column index 2) must keep working exactly as
  today — `test/services/boq_ingestor_test.rb`'s existing tests must still pass unchanged.
- The "detailed" layout (QTY anchor in column index 4) maps: phase marker = col 1, item =
  col 2, specs = col 3 (read, not stored), qty = col 4, uom = col 5, unit_material_cost =
  col 6, total_material = col 7, unit_labor_cost = col 8, total_labor = col 9, (col 10
  ignored — "Direct L&M Cost", redundant with total), total_cost = col 11.
- If the QTY anchor lands in any column other than index 2 or index 4, raise a clear error
  naming the column found — never guess at a third mapping.
- A row is only treated as a real line item if, in addition to the existing
  item-text-non-empty and qty-text-non-empty checks, the qty value also parses to an actual
  number via `clean_number`. This is required to correctly skip repeated header/subtotal
  rows that appear mid-document in the real file (verified: the real file repeats its
  header block for print pagination, and has subtotal rollup rows with blank qty — both
  have non-numeric or blank data in the qty column and must not become items).
- Phase-heading detection: a row whose phase-marker column matches `\A\d+\.0\z` (e.g. "1.0",
  "2.0") AND has an empty qty column is a **phase** heading (not a scope) — this was
  explicitly confirmed with the user, since this is how the real file's top-level sections
  ("General Requirements", "Earthworks", "Superstructures") are numbered, and `phase` feeds
  filters/reports used throughout the app (`portal.js`, MRF, POs, subcontractor tracking).
  This check must run before the general `SCOPE_ROW` check (`\A\d+\.\d+\z`), since "1.0"
  would otherwise also match the more general scope pattern.
- Formula cells (from either `roo` or `spreadsheet`) must resolve to their calculated value,
  not a formula-object/string, before reaching `clean_number`.
- Do not touch `app/views/portal/index.html.erb`'s `accept=".xlsx, .xls"` file input — it
  already advertises `.xls` support; this plan is what makes that already-true.

---

### Task 1: Add `.xls` support and formula-value normalization

**Files:**
- Modify: `Gemfile`
- Modify: `app/services/boq_ingestor.rb` (`read_workbook`, `cell`)
- Test: `test/services/boq_ingestor_test.rb`

**Interfaces:**
- Produces: `read_workbook(base64_data, file_name)` still returns `[sheet_name, rows]`
  where `rows` is an array of plain arrays of already-resolved values (numbers/strings,
  never formula wrapper objects) — Task 2 consumes this unchanged shape regardless of
  whether the source was `.xls` or `.xlsx`.

- [ ] **Step 1: Add the gem**

In `Gemfile`, add this line immediately after the existing `gem "roo", "~> 2.10"` line:
```ruby
gem "spreadsheet", "~> 1.3"
```

Run: `bundle install`
Expected: `spreadsheet` (and its dependency `ruby-ole`) install cleanly and `Gemfile.lock`
is updated. (These gems were already verified installable/usable in this environment during
design — this should be a fast, uneventful install.)

- [ ] **Step 2: Write a failing test for `.xls` support**

Add to `test/services/boq_ingestor_test.rb` (inside the existing test class, alongside
`SAMPLE_ROWS`):

```ruby
  test "read_workbook opens legacy .xls files and resolves formula cells to plain values" do
    book = Spreadsheet::Workbook.new
    sheet = book.create_worksheet(name: "AR BOM")
    sheet.row(0).concat(["ITEM", "DESCRIPTION", "QTY", "UNIT", "U/C MAT", "TOTAL MAT", "U/C LABOR", "TOTAL LABOR", "TOTAL"])
    sheet.row(1).concat(["", "Concrete 4000psi", 10, "cu.m", 4500, 45_000, 1200, 12_000, 57_000])
    io = StringIO.new
    book.write(io)
    base64 = Base64.strict_encode64(io.string)

    sheet_name, rows = BoqIngestor.read_workbook(base64, "boq.xls")

    assert_equal "AR BOM", sheet_name
    assert_equal ["ITEM", "DESCRIPTION", "QTY", "UNIT", "U/C MAT", "TOTAL MAT", "U/C LABOR", "TOTAL LABOR", "TOTAL"], rows[0]
    assert_equal 45_000, rows[1][5]
  end
```

Run: `bin/rails test test/services/boq_ingestor_test.rb -n test_read_workbook_opens_legacy_.xls_files_and_resolves_formula_cells_to_plain_values`
Expected: FAIL — `read_workbook` currently raises `ArgumentError` trying to open `.xls` via
`Roo::Spreadsheet.open` (no `:xls` key registered).

- [ ] **Step 3: Implement `.xls` support in `read_workbook` and formula normalization in `cell`**

Change `app/services/boq_ingestor.rb`'s `require` line:
```ruby
require "roo"
```
to:
```ruby
require "roo"
require "spreadsheet"
```

Replace `read_workbook`:
```ruby
  def self.read_workbook(base64_data, file_name)
    ext = File.extname(file_name.to_s).delete(".").downcase
    ext = "xlsx" if ext.empty?
    Tempfile.create(["boq", ".#{ext}"], binmode: true) do |f|
      f.write(Base64.decode64(base64_data))
      f.flush
      workbook = Roo::Spreadsheet.open(f.path, extension: ext.to_sym)
      sheet_name = find_boq_sheet_name(workbook)
      sheet = workbook.sheet(sheet_name)
      rows = (1..(sheet.last_row || 0)).map { |r| sheet.row(r) }
      return [sheet_name, rows]
    end
  end
```
with:
```ruby
  def self.read_workbook(base64_data, file_name)
    ext = File.extname(file_name.to_s).delete(".").downcase
    ext = "xlsx" if ext.empty?
    Tempfile.create(["boq", ".#{ext}"], binmode: true) do |f|
      f.write(Base64.decode64(base64_data))
      f.flush
      if ext == "xls"
        read_legacy_xls(f.path)
      else
        read_roo_workbook(f.path, ext)
      end
    end
  end

  def self.read_roo_workbook(path, ext)
    workbook = Roo::Spreadsheet.open(path, extension: ext.to_sym)
    sheet_name = find_boq_sheet_name(workbook)
    sheet = workbook.sheet(sheet_name)
    rows = (1..(sheet.last_row || 0)).map { |r| sheet.row(r).map { |v| resolve_cell_value(v) } }
    [sheet_name, rows]
  end

  def self.read_legacy_xls(path)
    workbook = Spreadsheet.open(path)
    sheet_name = find_boq_sheet_name_legacy(workbook)
    sheet = workbook.worksheet(sheet_name)
    rows = (0...sheet.row_count).map do |r|
      row = sheet.row(r)
      (0...sheet.column_count).map { |c| resolve_cell_value(row[c]) }
    end
    # The `spreadsheet` gem keeps its own open file handle on the underlying OLE2
    # document alive until the Workbook object is garbage collected -- on Windows
    # (unlike Linux/Railway) an open file can't be deleted, so without this, the
    # caller's Tempfile cleanup raises Errno::EACCES right after this method
    # returns, even though parsing itself succeeded. Verified fix during design:
    # dropping the reference and forcing a GC pass here releases the handle before
    # the caller's Tempfile.create block tries to unlink the file.
    workbook = nil
    GC.start
    [sheet_name, rows]
  end

  def self.find_boq_sheet_name_legacy(workbook)
    names = workbook.worksheets.map(&:name)
    names.each do |name|
      up = name.upcase
      next if up.include?("SUM")
      return name if TARGET_SHEET_PATTERNS.any? { |p| up.include?(p) }
    end
    names.first
  end

  # Both `roo` (.xlsx/.xlsm/.ods/.csv) and `spreadsheet` (.xls) can hand back a
  # formula wrapper instead of a plain value for computed cells -- normalize
  # to the cached calculated result either way so downstream parsing never
  # has to know which library produced a given row.
  def self.resolve_cell_value(v)
    v.respond_to?(:value) ? v.value : v
  end
```

Note: `find_boq_sheet_name` (the existing method, used by the `roo` path) takes a `workbook`
object and calls `workbook.sheets`; `Spreadsheet::Workbook` (the legacy-xls library) has no
`sheets` method (it uses `worksheets`, returning worksheet objects, not name strings) — hence
the separate `find_boq_sheet_name_legacy` above rather than trying to reuse the same method
for both.

- [ ] **Step 4: Run the new test, confirm it passes**

Run: `bin/rails test test/services/boq_ingestor_test.rb -n test_read_workbook_opens_legacy_.xls_files_and_resolves_formula_cells_to_plain_values`
Expected: PASS

- [ ] **Step 5: Run the full existing test file to confirm no regressions**

Run: `bin/rails test test/services/boq_ingestor_test.rb`
Expected: all tests PASS (including the pre-existing `.xlsx`-path tests — the `roo` path
now runs cell values through `resolve_cell_value`, which is a no-op passthrough for plain
values, so no behavior change there).

- [ ] **Step 6: Commit**

```bash
git add Gemfile Gemfile.lock app/services/boq_ingestor.rb test/services/boq_ingestor_test.rb
git commit -m "Add legacy .xls support to BoqIngestor via the spreadsheet gem"
```

---

### Task 2: Recognize the detailed-breakdown column layout and fix phase/scope grouping

**Files:**
- Modify: `app/services/boq_ingestor.rb` (`ingest_rows`, header/column detection, phase/scope
  regexes)
- Test: `test/services/boq_ingestor_test.rb`

**Interfaces:**
- Consumes: `read_workbook`'s normalized `[sheet_name, rows]` shape from Task 1.
- Produces: `ingest_rows(raw_data, sheet_name, project_code, company, file_name)` — same
  public signature, now layout-aware internally. No caller (`self.call`) changes.

- [ ] **Step 1: Write failing tests for the detailed layout, using realistic fixture data**

Add to `test/services/boq_ingestor_test.rb`, alongside the existing `SAMPLE_ROWS`:

```ruby
  # Modeled on the real client file's "detailed breakdown" tab structure (verified
  # directly against tmp/sample_boq.xls during design): two-row header, a SPECS column,
  # QTY anchor in column index 4 (not 2), and a TOTAL column at index 11. Values below
  # are fictional but structurally faithful, including two noise rows that occur in the
  # real file and must NOT become items:
  #   - row index 5: a repeated header block partway through the document (the real file
  #     repeats its header for print pagination). Its qty column holds literal text
  #     ("Quantity"), which is non-empty as a string -- this specifically requires the
  #     new "qty must parse as an actual number" check; the pre-existing "qty column must
  #     be non-empty text" check alone would NOT have excluded it.
  #   - row index 7: a subtotal rollup row for a sub-group of items (blank qty column).
  #     This was ALREADY excluded by the pre-existing "qty must be non-empty text" check
  #     even before this change -- included here as a regression guard, not a test of the
  #     new numeric-qty logic. (Named to avoid containing "TOTAL"/"SUB-TOTAL", so it isn't
  #     accidentally excluded by that unrelated, separate filter instead.)
  DETAILED_SAMPLE_ROWS = [
    ["", "PP-01", "D E S C R I P T I O N", "SPECS", "Quantity", "Unit", "Direct Materials Cost", "", "Direct Labor Cost", "", "Direct", "TOTAL"],
    ["", "", "", "", "", "", "Unit Cost", "amount", "Unit Cost", "amount", "L & M Cost", ""],
    ["", "1.0", "General Requirements", "", "", "", "", "", "", "", "", ""],
    ["", "", "Mobilization/demobilization", "", 1.0, "Lot", 35_000.0, 35_000.0, "", "", 999_999.0, 35_000.0],
    ["", "2.0", "Earthworks", "", "", "", "", "", "", "", "", ""],
    ["", "PP-02", "D E S C R I P T I O N", "SPECS", "Quantity", "Unit", "Direct Materials Cost", "", "Direct Labor Cost", "", "Direct", "TOTAL"],
    ["", "", "", "", "", "", "Unit Cost", "amount", "Unit Cost", "amount", "L & M Cost", ""],
    ["", "", "COLUMNS GF rollup", "", "", "", "", 21_600.0, "", 9_720.0, "", 31_320.0],
    ["", "", "2X3X12 COCO LUMBER", "", 200.0, "pcs", 108.0, 21_600.0, 0.45, 9_720.0, 888_888.0, 31_320.0]
  ].freeze
  # Column 10 ("Direct L&M Cost", ignored) is deliberately set to a nonsense value
  # (999_999.0 / 888_888.0) different from column 11 (TOTAL) in both item rows above --
  # in the real file these two columns are always numerically equal (TOTAL = material +
  # labor amount), which would let a bug that reads column 10 instead of column 11 pass
  # unnoticed. Making them differ here means the `total_cost` assertions below actually
  # prove column 11 is what's read.

  test "parses the detailed-breakdown layout (QTY anchor in column E)" do
    result = BoqIngestor.ingest_rows(DETAILED_SAMPLE_ROWS.map(&:dup), "detailed breakdown", "PRJ-DB", "SP Bedana", "boq.xls")
    assert_equal "✅ Successfully processed 2 items from \"detailed breakdown\" into the database.", result

    items = BoqItem.order(:id).to_a
    assert_equal 2, items.length

    mobilization = items[0]
    assert_equal "General Requirements", mobilization.phase
    assert_equal "", mobilization.scope
    assert_equal "Mobilization/demobilization", mobilization.item
    assert_equal 1, mobilization.qty
    assert_equal "Lot", mobilization.uom
    assert_equal 35_000.0, mobilization.total_cost.to_f

    lumber = items[1]
    assert_equal "Earthworks", lumber.phase # inherited from the "2.0" heading, carried through the noise rows in between
    assert_equal "2X3X12 COCO LUMBER", lumber.item
    assert_equal 200, lumber.qty
    assert_equal 108.0, lumber.unit_material_cost.to_f
    assert_equal 21_600.0, lumber.total_material.to_f
    assert_equal 0.45, lumber.unit_labor_cost.to_f
    assert_equal 9_720.0, lumber.total_labor.to_f
    assert_equal 31_320.0, lumber.total_cost.to_f # from the TOTAL column, not the ignored "Direct L&M Cost" column
  end

  test "does not misidentify a repeated mid-document header block, or a blank-qty subtotal rollup row, as line items" do
    result = BoqIngestor.ingest_rows(DETAILED_SAMPLE_ROWS.map(&:dup), "detailed breakdown", "PRJ-DB2", "SP Bedana", "boq.xls")
    assert_equal "✅ Successfully processed 2 items from \"detailed breakdown\" into the database.", result
    # 2 items expected (Mobilization + the lumber row) -- NOT 4, which is what you'd get
    # if the repeated "D E S C R I P T I O N" header row (qty column = literal text
    # "Quantity") and the blank-qty "COLUMNS GF rollup" row were incorrectly ingested.
  end

  test "raises a clear error when the QTY header lands in an unrecognized column" do
    weird_rows = [["", "", "", "QTY", "", "", "", "", ""]] # QTY in column index 3 -- neither known layout
    error = assert_raises(RuntimeError) do
      BoqIngestor.ingest_rows(weird_rows, "mystery sheet", "PRJ-X", "SP Bedana", "boq.xlsx")
    end
    assert_match(/column/i, error.message)
  end
```

Run: `bin/rails test test/services/boq_ingestor_test.rb -n "/detailed-breakdown|repeated mid-document|unrecognized column/"`
Expected: FAIL — `ingest_rows` currently only looks in column index 2 for the QTY anchor,
so it either raises "Could not find 'QTY' in Column C" or, if it happens to find something
by coincidence, produces wrong phase/item/cost values.

- [ ] **Step 2: Implement layout detection and column-mapping-driven parsing**

Replace the constants block at the top of `app/services/boq_ingestor.rb`:
```ruby
  TARGET_SHEET_PATTERNS = ["AR BOM", "DETAILED", "BOQ", "BILL OF QUANTITIES", "BOM", "BILL OF MATERIALS"].freeze
  QTY_HEADERS = ["QTY", "QTY.", "QUANTITY"].freeze
  PHASE_PREFIX = /\A([a-zA-Z0-9IVXLCDM]+\.\s*)/
  PHASE_ROW = /\A([a-zA-Z0-9IVXLCDM]+\.)?\s*[A-Za-z]/
  SCOPE_ROW = /\A\d+\.\d+/
```
with:
```ruby
  TARGET_SHEET_PATTERNS = ["AR BOM", "DETAILED", "BOQ", "BILL OF QUANTITIES", "BOM", "BILL OF MATERIALS"].freeze
  QTY_HEADERS = ["QTY", "QTY.", "QUANTITY"].freeze
  PHASE_PREFIX = /\A([a-zA-Z0-9IVXLCDM]+\.\s*)/
  PHASE_ROW = /\A([a-zA-Z0-9IVXLCDM]+\.)?\s*[A-Za-z]/
  TOP_LEVEL_SECTION_ROW = /\A\d+\.0\z/
  SCOPE_ROW = /\A\d+\.\d+\z/

  # Two known real-world column layouts, selected by which column the QTY/QUANTITY
  # header cell is found in. Column indices are 0-based.
  LAYOUTS_BY_QTY_COLUMN = {
    2 => { # existing "simple" layout -- ITEM,DESCRIPTION,QTY,UNIT,U/C MAT,TOTAL MAT,U/C LABOR,TOTAL LABOR,TOTAL
      phase_col: 0, item_col: 1, qty_col: 2, uom_col: 3,
      unit_material_col: 4, total_material_col: 5,
      unit_labor_col: 6, total_labor_col: 7, total_col: 8
    }.freeze,
    4 => { # "detailed breakdown" layout -- verified against the real client BOM file
      phase_col: 1, item_col: 2, qty_col: 4, uom_col: 5,
      unit_material_col: 6, total_material_col: 7,
      unit_labor_col: 8, total_labor_col: 9, total_col: 11
    }.freeze
  }.freeze
```

Replace the header-detection loop at the start of `ingest_rows`:
```ruby
    header_row_idx = nil
    raw_data.each_with_index do |row, i|
      col_c = cell(row, 2).upcase
      if QTY_HEADERS.include?(col_c)
        header_row_idx = i
        break
      end
    end
    unless header_row_idx
      raise "Could not find 'QTY' in Column C of sheet #{sheet_name} to use as the header anchor."
    end
```
with:
```ruby
    header_row_idx = nil
    layout = nil
    raw_data.each_with_index do |row, i|
      qty_col_idx = row.each_index.find { |idx| QTY_HEADERS.include?(normalize_header(row[idx])) }
      next unless qty_col_idx

      layout = LAYOUTS_BY_QTY_COLUMN[qty_col_idx]
      unless layout
        raise "Unrecognized column layout in sheet #{sheet_name} -- found a QTY/QUANTITY " \
              "header in column index #{qty_col_idx}, but only column 2 or column 4 are " \
              "recognized layouts."
      end
      header_row_idx = i
      break
    end
    unless header_row_idx
      raise "Could not find a 'QTY'/'QUANTITY' header cell anywhere in sheet #{sheet_name} " \
            "to use as the header anchor."
    end
```

Replace the row-parsing loop body (the `raw_data.each_with_index do |row, i| ... end` block
that builds `new_items`):
```ruby
    raw_data.each_with_index do |row, i|
      next if i <= header_row_idx
      next if row.all? { |c| c.to_s.strip.empty? }

      col_a = cell(row, 0)
      col_b = cell(row, 1)
      col_c = cell(row, 2)

      if col_a.match?(PHASE_ROW) && col_c.empty? && !col_a.match?(SCOPE_ROW)
        current_phase = col_a.sub(PHASE_PREFIX, "").strip
        current_scope = ""
        next
      end

      if col_a.match?(SCOPE_ROW) && col_c.empty?
        current_scope = col_b
        next
      end

      next if col_b.upcase.include?("TOTAL") || col_b.upcase.include?("SUB-TOTAL")

      if !col_b.empty? && !col_c.empty?
        new_items << {
          phase: current_phase.presence || "Uncategorized Phase",
          item: col_b,
          qty: clean_number(col_c),
          uom: cell(row, 3),
          unit_labor_cost: clean_number(row[6]),
          unit_material_cost: clean_number(row[4]),
          total_labor: clean_number(row[7]),
          total_material: clean_number(row[5]),
          total_cost: clean_number(row[8]),
          project_code: project_code.strip,
          source_file: file_name,
          entry_date: timestamp,
          scope: current_scope,
          company: company
        }
      end
    end
```
with:
```ruby
    raw_data.each_with_index do |row, i|
      next if i <= header_row_idx
      next if row.all? { |c| c.to_s.strip.empty? }

      col_phase = cell(row, layout[:phase_col])
      col_item  = cell(row, layout[:item_col])
      col_qty   = cell(row, layout[:qty_col])
      phase_marker = raw_cell_text(row, layout[:phase_col])

      if phase_marker.match?(TOP_LEVEL_SECTION_ROW) && col_qty.empty?
        current_phase = col_item
        current_scope = ""
        next
      end

      if phase_marker.match?(PHASE_ROW) && col_qty.empty? && !phase_marker.match?(SCOPE_ROW)
        current_phase = col_phase.sub(PHASE_PREFIX, "").strip
        current_scope = ""
        next
      end

      if phase_marker.match?(SCOPE_ROW) && col_qty.empty?
        current_scope = col_item
        next
      end

      next if col_item.upcase.include?("TOTAL") || col_item.upcase.include?("SUB-TOTAL")

      qty = clean_number(col_qty)
      if !col_item.empty? && !col_qty.empty? && qty
        new_items << {
          phase: current_phase.presence || "Uncategorized Phase",
          item: col_item,
          qty: qty,
          uom: cell(row, layout[:uom_col]),
          unit_labor_cost: clean_number(row[layout[:unit_labor_col]]),
          unit_material_cost: clean_number(row[layout[:unit_material_col]]),
          total_labor: clean_number(row[layout[:total_labor_col]]),
          total_material: clean_number(row[layout[:total_material_col]]),
          total_cost: clean_number(row[layout[:total_col]]),
          project_code: project_code.strip,
          source_file: file_name,
          entry_date: timestamp,
          scope: current_scope,
          company: company
        }
      end
    end
```

Add new helper methods near `cell`/`clean_number`:
```ruby
  # Strips internal whitespace in addition to the usual strip+upcase, so header cells
  # using letter-spacing for visual effect (e.g. "D E S C R I P T I O N", seen in the
  # real client file) still match plain keywords like "DESCRIPTION" or "QTY".
  def self.normalize_header(val)
    val.to_s.strip.upcase.gsub(/\s+/, "")
  end

  # Like `cell`, but without the whole-number-Float-to-Integer rounding -- used where
  # a value's exact decimal form matters (phase/scope marker classification), since
  # Excel can store markers like "1.0" as a genuine number rather than text, and
  # rounding it to "1" would break matching against a pattern like \A\d+\.0\z. Verified
  # against the real client file during implementation: its phase markers ("1.0",
  # "2.0", "3.0") are stored as actual Excel numbers, not text, and without this fix
  # every item was silently landing in "Uncategorized Phase" instead of its real phase.
  def self.raw_cell_text(row, idx)
    row[idx].to_s.strip
  end
```

Use `raw_cell_text` (not `cell`) specifically for the three phase/scope classification checks
(`TOP_LEVEL_SECTION_ROW`, `PHASE_ROW`, `SCOPE_ROW` matches) in the row-parsing loop below —
`col_phase` (via `cell`) is still used for the display-text substitution
(`col_phase.sub(PHASE_PREFIX, "")`), and `col_item`/`col_qty` are unaffected by this
distinction.

- [ ] **Step 3: Run the new tests, confirm they pass**

Run: `bin/rails test test/services/boq_ingestor_test.rb -n "/detailed-breakdown|repeated mid-document|unrecognized column/"`
Expected: PASS

- [ ] **Step 4: Run the full test file and the existing Cucumber feature to confirm no regressions**

Run: `bin/rails test test/services/boq_ingestor_test.rb`
Expected: all tests PASS, including the original simple-layout tests (their QTY anchor is
in column index 2, so `LAYOUTS_BY_QTY_COLUMN[2]` — identical field mapping to the original
hardcoded indices — is selected, and none of their fixture rows match
`TOP_LEVEL_SECTION_ROW`, so phase/scope classification is byte-for-byte the same as before).

Run: `bundle exec cucumber features/build_boq_approval.feature`
Expected: all scenarios PASS (this feature exercises `Api::BoqBuilderController`, a
different code path from `BoqIngestor`, but confirm it's unaffected).

- [ ] **Step 5: Commit**

```bash
git add app/services/boq_ingestor.rb test/services/boq_ingestor_test.rb
git commit -m "Recognize the detailed-breakdown column layout and fix N.0 phase grouping"
```

---

### Task 3: Update the "See expected file format" guide

**Files:**
- Modify: `app/assets/javascripts/upload_format_guides.js`

**Interfaces:** None — this is a standalone UI guide, no shared state with the backend
parsing logic (it's documentation, not code the ingestor reads).

- [ ] **Step 1: Add a second example table for the detailed layout**

In `app/assets/javascripts/upload_format_guides.js`, the `GUIDES` array currently has one
entry (`fileInputId: "fileInput"`) with a single `columns`/`rows`/`notes` set. Change the
guide entry's shape to support multiple named examples, and add the detailed layout as a
second one. Replace:

```javascript
  var GUIDES = [
    {
      fileInputId: "fileInput",
      title: "Expected BOQ Excel Format",
      intro: "The uploader looks for a sheet whose name contains one of: " +
        '<strong>BOQ, BOM, Detailed, Bill of Quantities, Bill of Materials</strong> ' +
        "(a sheet with \"SUM\" in its name, like a Summary tab, is skipped). " +
        'Within that sheet, it scans column C for a header cell that says ' +
        '<strong>QTY</strong>, <strong>QTY.</strong>, or <strong>QUANTITY</strong> -- ' +
        "everything above that row is ignored, everything below it is read as data.",
      columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
      rows: [
        { label: "Header row (anchor)", cells: ["", "ITEM DESCRIPTION", "QTY", "UOM", "MAT'L UNIT COST", "MAT'L TOTAL", "LABOR UNIT COST", "LABOR TOTAL", "TOTAL COST"], kind: "header" },
        { label: "Phase heading", cells: ["I. Sitework", "", "", "", "", "", "", "", ""], kind: "phase" },
        { label: "Scope row", cells: ["1.1", "Clearing and Grubbing", "", "", "", "", "", "", ""], kind: "scope" },
        { label: "Item row", cells: ["", "4000 psi Portland Cement", "50", "bag", "245", "12250", "20", "1000", "13250"], kind: "item" },
        { label: "Skipped automatically", cells: ["", "SUB-TOTAL", "", "", "", "", "", "", ""], kind: "skip" }
      ],
      notes: [
        "A row counts as a <strong>phase heading</strong> when Column A has text (e.g. \"I. Sitework\") and Column C is blank.",
        "A row counts as a <strong>scope row</strong> when Column A looks like \"1.1\" and Column C is blank -- put the description in Column B.",
        "A row counts as an actual <strong>line item</strong> only when both Column B (item name) and Column C (qty) have values.",
        "Rows where Column B contains \"TOTAL\" or \"SUB-TOTAL\" are skipped automatically -- no need to remove your subtotal rows first.",
        "Row order matters: items are attached to whichever phase/scope heading came most recently above them."
      ]
    }
  ];
```

with:

```javascript
  var GUIDES = [
    {
      fileInputId: "fileInput",
      title: "Expected BOQ Excel Format",
      intro: "The uploader looks for a sheet whose name contains one of: " +
        '<strong>BOQ, BOM, Detailed, Bill of Quantities, Bill of Materials</strong> ' +
        "(a sheet with \"SUM\" in its name, like a Summary tab, is skipped). " +
        "Two column layouts are recognized automatically, based on which column has the " +
        '<strong>QTY</strong>/<strong>QUANTITY</strong> header -- everything above that ' +
        "row is ignored, everything below it is read as data. Both accept "
        + "<strong>.xlsx</strong> and <strong>.xls</strong> files.",
      examples: [
        {
          subtitle: "Layout 1: QTY in column C",
          columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
          rows: [
            { label: "Header row (anchor)", cells: ["", "ITEM DESCRIPTION", "QTY", "UOM", "MAT'L UNIT COST", "MAT'L TOTAL", "LABOR UNIT COST", "LABOR TOTAL", "TOTAL COST"], kind: "header" },
            { label: "Phase heading", cells: ["I. Sitework", "", "", "", "", "", "", "", ""], kind: "phase" },
            { label: "Scope row", cells: ["1.1", "Clearing and Grubbing", "", "", "", "", "", "", ""], kind: "scope" },
            { label: "Item row", cells: ["", "4000 psi Portland Cement", "50", "bag", "245", "12250", "20", "1000", "13250"], kind: "item" },
            { label: "Skipped automatically", cells: ["", "SUB-TOTAL", "", "", "", "", "", "", ""], kind: "skip" }
          ],
          notes: [
            "A row counts as a <strong>phase heading</strong> when Column A has text (e.g. \"I. Sitework\") and Column C is blank.",
            "A row counts as a <strong>scope row</strong> when Column A looks like \"1.1\" and Column C is blank -- put the description in Column B.",
            "A row counts as an actual <strong>line item</strong> only when Column B (item name) and Column C (qty) both have values, and Column C is a real number."
          ]
        },
        {
          subtitle: "Layout 2: QTY in column E (two-row header, with a Specs column)",
          columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
          rows: [
            { label: "Header row (anchor)", cells: ["", "Item#", "Description", "Specs", "Quantity", "Unit", "Direct Materials Cost", "", "Direct Labor Cost", "", "Direct L&M Cost", "TOTAL"], kind: "header" },
            { label: "Header sub-row", cells: ["", "", "", "", "", "", "Unit Cost", "amount", "Unit Cost", "amount", "", ""], kind: "header" },
            { label: "Phase heading", cells: ["", "1.0", "General Requirements", "", "", "", "", "", "", "", "", ""], kind: "phase" },
            { label: "Item row", cells: ["", "", "Mobilization/demobilization", "", "1", "Lot", "35000", "35000", "", "", "35000", "35000"], kind: "item" }
          ],
          notes: [
            "A row counts as a <strong>phase heading</strong> when the item-number column is whole-number-dot-zero (e.g. \"1.0\", \"2.0\") and the Quantity column is blank -- the Description column becomes the phase name.",
            "The Specs column and \"Direct L&M Cost\" column are read but not stored -- Column L (TOTAL) is what's saved as the item's total cost.",
            "An item row still needs a real number in the Quantity column -- text like \"Quantity\" (from a repeated header block on a later printed page) is correctly ignored, not imported as a bogus item."
          ]
        }
      ]
    }
  ];
```

- [ ] **Step 2: Update `buildModal` to render one or more examples**

Replace `buildModal`:
```javascript
  function buildModal(guide, modalId) {
    var theadCells = guide.columns.map(function (c) { return "<th>" + c + "</th>"; }).join("");
    var bodyRows = guide.rows.map(function (r) {
      var cells = r.cells.map(function (c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("");
      return '<tr class="' + rowClass(r.kind) + '"><td class="small text-muted">' + escapeHtml(r.label) + "</td>" + cells + "</tr>";
    }).join("");
    var notesHtml = guide.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("");

    var modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.tabIndex = -1;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">' +
      '  <div class="modal-content border-0 shadow">' +
      '    <div class="modal-header"><h5 class="modal-title fw-bold">' + escapeHtml(guide.title) + '</h5>' +
      '      <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <p class="small">' + guide.intro + "</p>" +
      '      <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">' +
      '        <table class="table table-sm table-bordered mb-2" style="font-size: 0.78rem; white-space: nowrap;">' +
      '          <thead><tr><th></th>' + theadCells + "</tr></thead>" +
      "          <tbody>" + bodyRows + "</tbody>" +
      "        </table>" +
      "      </div>" +
      '      <ul class="small text-muted mb-0">' + notesHtml + "</ul>" +
      "    </div>" +
      '    <div class="modal-footer">' +
      '      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>' +
      "    </div>" +
      "  </div></div>";
    document.body.appendChild(modal);
    return modal;
  }
```
with:
```javascript
  function buildExampleHtml(example) {
    var theadCells = example.columns.map(function (c) { return "<th>" + c + "</th>"; }).join("");
    var bodyRows = example.rows.map(function (r) {
      var cells = r.cells.map(function (c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("");
      return '<tr class="' + rowClass(r.kind) + '"><td class="small text-muted">' + escapeHtml(r.label) + "</td>" + cells + "</tr>";
    }).join("");
    var notesHtml = example.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("");

    return (example.subtitle ? '<h6 class="fw-bold mt-3">' + escapeHtml(example.subtitle) + "</h6>" : "") +
      '<div class="table-responsive" style="overflow-x: auto; max-width: 100%;">' +
      '  <table class="table table-sm table-bordered mb-2" style="font-size: 0.78rem; white-space: nowrap;">' +
      '    <thead><tr><th></th>' + theadCells + "</tr></thead>" +
      "    <tbody>" + bodyRows + "</tbody>" +
      "  </table>" +
      "</div>" +
      '<ul class="small text-muted">' + notesHtml + "</ul>";
  }

  function buildModal(guide, modalId) {
    var examplesHtml = guide.examples.map(buildExampleHtml).join("");

    var modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.tabIndex = -1;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">' +
      '  <div class="modal-content border-0 shadow">' +
      '    <div class="modal-header"><h5 class="modal-title fw-bold">' + escapeHtml(guide.title) + '</h5>' +
      '      <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <p class="small">' + guide.intro + "</p>" +
      examplesHtml +
      "    </div>" +
      '    <div class="modal-footer">' +
      '      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>' +
      "    </div>" +
      "  </div></div>";
    document.body.appendChild(modal);
    return modal;
  }
```

- [ ] **Step 3: Verify**

Run: `node -c app/assets/javascripts/upload_format_guides.js` if Node is available, to
syntax-check; otherwise carefully re-read the edited file for balanced braces/parens.
There is no automated JS test suite for this file in this app (confirmed: no `test/` or
`spec/` coverage references `upload_format_guides`) — manual review of the diff against the
brief is the verification here.

- [ ] **Step 4: Commit**

```bash
git add app/assets/javascripts/upload_format_guides.js
git commit -m "Document the detailed-breakdown layout in the upload format guide"
```
