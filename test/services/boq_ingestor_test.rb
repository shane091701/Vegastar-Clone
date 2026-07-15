require "test_helper"

class BoqIngestorTest < ActiveSupport::TestCase
  SAMPLE_ROWS = [
    ["", "", "", "", "", "", "", "", ""],
    ["ITEM", "DESCRIPTION", "QTY", "UNIT", "U/C MAT", "TOTAL MAT", "U/C LABOR", "TOTAL LABOR", "TOTAL"],
    ["1. CIVIL WORKS", "", "", "", "", "", "", "", ""],
    ["1.1", "Foundation", "", "", "", "", "", "", ""],
    ["", "Concrete 4000psi", "10", "cu.m", "4,500.00", "45,000.00", "1,200.00", "12,000.00", "57,000.00"],
    ["", "Rebar 16mm", "200", "pcs", "350", "70,000", "50", "10,000", "80,000"],
    ["", "SUB-TOTAL", "500", "", "", "", "", "", ""],
    ["II. ELECTRICAL", "", "", "", "", "", "", "", ""],
    ["", "Panel Board", "1", "Lot", "", "25,000", "", "5,000", "30,000"]
  ].freeze

  test "parses phases, scopes, and items exactly like processData_" do
    result = BoqIngestor.ingest_rows(SAMPLE_ROWS.map(&:dup), "AR BOM", "PRJ1", "SP Bedana", "boq.xlsx")
    assert_equal "✅ Successfully processed 3 items from \"AR BOM\" into the database.", result

    items = BoqItem.order(:id).to_a
    assert_equal 3, items.length

    concrete = items[0]
    assert_equal "CIVIL WORKS", concrete.phase
    assert_equal "Foundation", concrete.scope
    assert_equal "Concrete 4000psi", concrete.item
    assert_equal 10, concrete.qty
    assert_equal "cu.m", concrete.uom
    assert_equal 1200.0, concrete.unit_labor_cost.to_f   # source col G
    assert_equal 4500.0, concrete.unit_material_cost.to_f # source col E
    assert_equal 12_000.0, concrete.total_labor.to_f      # source col H
    assert_equal 45_000.0, concrete.total_material.to_f   # source col F
    assert_equal 57_000.0, concrete.total_cost.to_f       # source col I
    assert_equal "PRJ1", concrete.project_code
    assert_equal "SP Bedana", concrete.company

    panel = items[2]
    assert_equal "ELECTRICAL", panel.phase # roman numeral prefix stripped
    assert_equal "", panel.scope           # scope resets on new phase
    assert_equal "Lot", panel.uom
  end

  test "simple layout still imports a row with non-numeric qty text, storing qty as nil (pre-existing behavior)" do
    # The detailed layout requires qty to parse as a real number (to correctly skip a
    # repeated header block whose qty cell holds literal text) -- but the simple
    # layout must NOT gain that requirement, since it never had it and some real
    # BOQs use non-numeric qty text like "L.S." (lump sum).
    rows = [
      ["ITEM", "DESCRIPTION", "QTY", "UNIT", "U/C MAT", "TOTAL MAT", "U/C LABOR", "TOTAL LABOR", "TOTAL"],
      ["", "Lump sum electrical works", "L.S.", "Lot", "", "50,000", "", "10,000", "60,000"]
    ]
    result = BoqIngestor.ingest_rows(rows, "AR BOM", "PRJ-LS", "SP Bedana", "boq.xlsx")
    assert_equal "✅ Successfully processed 1 items from \"AR BOM\" into the database.", result

    item = BoqItem.order(:id).first
    assert_equal "Lump sum electrical works", item.item
    assert_nil item.qty
  end

  test "skips SUB-TOTAL rows" do
    BoqIngestor.ingest_rows(SAMPLE_ROWS.map(&:dup), "BOQ", "PRJ2", "", "f.xlsx")
    refute BoqItem.where("item ILIKE ?", "%TOTAL%").exists?
  end

  test "raises when no QTY header exists" do
    rows = [["A", "B", "NOPE", "D"]]
    error = assert_raises(RuntimeError) do
      BoqIngestor.ingest_rows(rows, "Sheet1", "PRJ3", "", "f.xlsx")
    end
    assert_match(/Could not find a 'QTY'\/'QUANTITY' header cell/, error.message)
  end

  test "raises a clear error when the QTY header lands in an unrecognized column" do
    weird_rows = [["", "", "", "QTY", "", "", "", "", ""]] # QTY in column index 3 -- neither known layout
    error = assert_raises(RuntimeError) do
      BoqIngestor.ingest_rows(weird_rows, "mystery sheet", "PRJ-X", "SP Bedana", "boq.xlsx")
    end
    assert_match(/column/i, error.message)
  end

  test "call rejects invalid project codes" do
    result = BoqIngestor.call(base64_data: "", file_name: "f.xlsx",
                              project_code: "BAD-CODE", customer_data: {})
    assert_equal "Error: Project Code may contain only letters, numbers, and spaces — no hyphens or symbols.", result
  end

  test "call rejects duplicate project codes" do
    Project.create!(code: "DUPE 1")
    result = BoqIngestor.call(base64_data: "", file_name: "f.xlsx",
                              project_code: "dupe 1", customer_data: {})
    assert_equal "Error: Project Code 'dupe 1' was already used. Please enter a unique code.", result
  end

  test "call rolls back the Project row when the workbook fails to parse" do
    result = BoqIngestor.call(base64_data: "not a real workbook", file_name: "f.xlsx",
                              project_code: "PRJ FAIL", customer_data: { "name" => "Someone" })
    assert_match(/\AError in processBOQ:/, result)
    refute Project.exists?(code: "PRJ FAIL"),
      "a failed upload must not leave a stuck Project row behind, blocking a retry with the same code"
  end

  test "anchors on the first QTY header row, not the last, so items above a later stray match aren't skipped" do
    rows = [
      ["", "", "", "", "", "", "", "", ""],
      ["ITEM", "DESCRIPTION", "QTY", "UNIT", "U/C MAT", "TOTAL MAT", "U/C LABOR", "TOTAL LABOR", "TOTAL"],
      ["1. CIVIL WORKS", "", "", "", "", "", "", "", ""],
      ["1.1", "Foundation", "", "", "", "", "", "", ""],
      ["", "Concrete 4000psi", "10", "cu.m", "4,500.00", "45,000.00", "1,200.00", "12,000.00", "57,000.00"],
      ["", "", "QTY", "", "", "", "", "", ""], # a stray second "QTY" match in column C
      ["II. ELECTRICAL", "", "", "", "", "", "", "", ""],
      ["", "Panel Board", "1", "Lot", "", "25,000", "", "5,000", "30,000"]
    ]

    BoqIngestor.ingest_rows(rows, "AR BOM", "PRJ-MULTI", "SP Bedana", "boq.xlsx")

    items = BoqItem.order(:id).pluck(:item)
    assert_includes items, "Concrete 4000psi",
      "an item row above a later stray QTY match must still be imported"
    assert_includes items, "Panel Board"
    assert_equal 2, items.length
  end

  # Modeled on the real client file's "detailed breakdown" tab structure (verified
  # directly against tmp/sample_boq.xls during design and implementation): two-row
  # header, a SPECS column, QTY anchor in column index 4 (not 2), and a TOTAL column at
  # index 11. Values below are fictional but structurally faithful, including two noise
  # rows that occur in the real file and must NOT become items:
  #   - row index 5: a repeated header block partway through the document (the real file
  #     repeats its header for print pagination). Its qty column holds literal text
  #     ("Quantity"), which is non-empty as a string -- this specifically requires the
  #     "qty must parse as an actual number" check, not just "qty column is non-empty".
  #   - row index 7: a subtotal rollup row for a sub-group of items (blank qty column),
  #     already excluded by the pre-existing "qty must be non-empty text" check.
  # Column 10 ("Direct L&M Cost", ignored) is deliberately set to a value different from
  # column 11 (TOTAL) in both item rows -- in the real file these are always numerically
  # equal, which would let a bug that reads column 10 instead of column 11 pass unnoticed.
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

  test "call rolls back the Project row when no valid item rows are found" do
    # A minimal CSV containing only the QTY header row (no data rows below
    # it), so BoqIngestor.ingest_rows returns the "no valid items" warning
    # instead of raising -- exercises the non-exception rollback path.
    csv_data = Base64.strict_encode64("ITEM,DESCRIPTION,QTY,UNIT\n")
    result = BoqIngestor.call(base64_data: csv_data, file_name: "empty.csv",
                              project_code: "PRJ EMPTY", customer_data: { "name" => "Someone" })
    assert_match(/\A⚠️ No valid item rows found/, result)
    refute Project.exists?(code: "PRJ EMPTY"),
      "a workbook with no item rows must not leave a stuck Project row behind"
  end
end
