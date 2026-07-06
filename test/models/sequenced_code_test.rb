require "test_helper"

class SequencedCodeTest < ActiveSupport::TestCase
  test "mrf codes are sequenced per project with hyphens stripped" do
    assert_equal "MRF-PRJA1-1", SequencedCode.next_mrf_code("PRJ-A1")
    MrfItem.create!(item: "Cement", project_code: "PRJ-A1", mrf_code: "MRF-PRJA1-1")
    assert_equal "MRF-PRJA1-2", SequencedCode.next_mrf_code("PRJ-A1")
    # Other projects have their own sequence
    assert_equal "MRF-OTHER-1", SequencedCode.next_mrf_code("OTHER")
  end

  test "po code uses MMDDYY prefix and 3-digit suffix" do
    prefix = "PO-#{Date.current.strftime('%m%d%y')}-"
    assert_equal "#{prefix}001", SequencedCode.next_po_code
    PurchaseOrderItem.create!(po_number: "#{prefix}001", supplier: "ACME")
    assert_equal "#{prefix}002", SequencedCode.next_po_code
  end

  test "boq submission code uses YYYYMMDD prefix" do
    assert_equal "BOQ-#{Date.current.strftime('%Y%m%d')}-001", SequencedCode.next_boq_submission_code
  end

  test "rtb code embeds project code" do
    assert_equal "RTB-PRJ1-001", SequencedCode.next_rtb_code("PRJ1")
  end

  test "entity codes pad correctly" do
    assert_equal "SUB-00001", SequencedCode.next_sub_code
    assert_equal "WP-00001", SequencedCode.next_wp_code
    assert_equal "MIL-00001", SequencedCode.next_milestone_code
    assert_equal "RPT-00001", SequencedCode.next_report_code
  end
end
