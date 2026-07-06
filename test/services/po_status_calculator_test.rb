require "test_helper"

class PoStatusCalculatorTest < ActiveSupport::TestCase
  def create_po(status: "Sent")
    PurchaseOrderItem.create!(po_number: "PO-1", supplier: "ACME", item_name: "Cement",
                              quantity: 10, unit_price: 100, status: status)
  end

  test "unknown PO is pending receipt" do
    assert_equal "Pending receipt", PoStatusCalculator.call("PO-404")
  end

  test "draft and voided short-circuit" do
    create_po(status: "Draft")
    assert_equal "Draft", PoStatusCalculator.call("PO-1")
    PurchaseOrderItem.update_all(status: "Voided")
    assert_equal "Voided", PoStatusCalculator.call("PO-1")
  end

  test "sent with no deliveries stays sent" do
    create_po
    assert_equal "Sent", PoStatusCalculator.call("PO-1")
  end

  test "partial and full delivery transitions" do
    create_po
    Delivery.create!(po_number: "PO-1", item_name: "Cement", quantity: 4)
    assert_equal "Partial delivery", PoStatusCalculator.call("PO-1")
    Delivery.create!(po_number: "PO-1", item_name: "Cement", quantity: 6)
    assert_equal "Received all", PoStatusCalculator.call("PO-1")
  end

  test "blank status defaults to sent" do
    create_po(status: "")
    assert_equal "Sent", PoStatusCalculator.call("PO-1")
  end
end
