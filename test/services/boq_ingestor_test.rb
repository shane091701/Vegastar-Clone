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
    result = BoqIngestor.ingest_rows(SAMPLE_ROWS.map(&:dup), "AR BOM", "PRJ1", "Vegastar", "boq.xlsx")
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
    assert_equal "Vegastar", concrete.company

    panel = items[2]
    assert_equal "ELECTRICAL", panel.phase # roman numeral prefix stripped
    assert_equal "", panel.scope           # scope resets on new phase
    assert_equal "Lot", panel.uom
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
    assert_match(/Could not find 'QTY' in Column C/, error.message)
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
end
