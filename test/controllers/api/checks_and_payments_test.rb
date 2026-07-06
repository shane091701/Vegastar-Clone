require "test_helper"

class Api::ChecksAndPaymentsTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "bulk payments create Not Deposited checks and deposit flow updates them" do
    api("logBulkPaymentData", [
      { "date" => "2026-08-01", "project" => "PRJ1", "bank" => "BDO", "checkNum" => "C-1", "amount" => 1000 },
      { "date" => "2026-07-01", "project" => "PRJ1", "bank" => "BPI", "checkNum" => "C-2", "amount" => 2000 }
    ], "admin@test.local")
    assert_equal 2, Check.where(status: "Not Deposited").count

    pending = api("getPendingChecks")
    assert_equal ["C-2", "C-1"], pending.map { |c| c["checkNumber"] } # earliest first

    assert api("updateCheckStatus", [pending[0]["rowIdx"]], "Deposited")
    assert_equal 1, Check.where(status: "Deposited").count
  end

  test "issue payment details computes due dates from earliest delivery plus term days" do
    MrfItem.create!(item: "Cement", project_code: "PRJ1", mrf_code: "MRF-PRJ1-1",
                    status: "Approved", po_code: "PO-9")
    PurchaseOrderItem.create!(po_number: "PO-9", supplier: "ACME", item_name: "Cement",
                              quantity: 10, unit_price: 100, status: "Sent")
    PaymentTerm.create!(mrf_code: "MRF-PRJ1-1", supplier: "ACME",
                        description: "30 days", percentage: "60%")
    PaymentTerm.create!(mrf_code: "MRF-PRJ1-1", supplier: "ACME",
                        description: "Upon delivery", percentage: "40%")
    Delivery.create!(po_number: "PO-9", item_name: "Cement", quantity: 5,
                     received_date: Time.zone.parse("2026-07-01 10:00"))

    terms = api("getIssuePaymentDetails", ["PO-9"])
    assert_equal 2, terms.length
    thirty = terms.find { |t| t["description"] == "30 days" }
    assert_equal 0.6, thirty["percentage"]
    assert_equal "2026-07-31", thirty["dueDate"]
    assert_equal 1000.0, thirty["poTotal"]
    refute thirty["isPaid"]

    api("saveIssuePayments", { "payments" => [
      { "mrfId" => "MRF-PRJ1-1", "poCode" => "PO-9", "termDesc" => "30 days",
        "percentage" => 60, "supplier" => "ACME", "invoicedAmt" => 600,
        "paymentDate" => "2026-07-31", "bank" => "BDO", "checkNumber" => "C-9",
        "paymentAmount" => 600 }
    ] }, "admin@test.local")
    assert_equal "60%", IssuePayment.last.percentage

    terms = api("getIssuePaymentDetails", ["PO-9"])
    assert terms.find { |t| t["description"] == "30 days" }["isPaid"]
  end

  test "historical pricing searches PO items case-insensitively" do
    MrfItem.create!(item: "Cement", project_code: "PRJ1", mrf_code: "M-1",
                    status: "Approved", po_code: "PO-9")
    PurchaseOrderItem.create!(po_number: "PO-9", supplier: "ACME", item_name: "Portland Cement",
                              quantity: 10, unit_price: 260, status: "Sent",
                              order_date: Time.current)
    assert_equal ["Portland Cement"], api("getUniqueHistoricalItems")
    rows = api("getHistoricalPrices", "cement")
    assert_equal 1, rows.length
    assert_equal "PRJ1", rows[0]["project"]
    assert_equal 260.0, rows[0]["unitPrice"]
    assert_empty api("getHistoricalPrices", "")
  end
end
