require "test_helper"

class Api::ExpensesControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    BoqItem.create!(project_code: "PRJ1", phase: "Civil", item: "Cement", total_cost: 100_000)
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "initial data hides hidden projects and defaults categories" do
    body = api("getExpenseInitialData")
    assert_equal ["PRJ1"], body["projects"]
    assert body["categories"].any?

    api("toggleHiddenExpenseProject", "PRJ1", true, "admin@test.local")
    assert_empty api("getExpenseInitialData")["projects"]
    assert_equal ["PRJ1"], api("getExpenseProjectManageData")["hiddenProjects"]

    api("toggleHiddenExpenseProject", "PRJ1", false, "admin@test.local")
    assert_equal ["PRJ1"], api("getExpenseInitialData")["projects"]
  end

  test "submitting expenses parses comma amounts and auto-creates construction bond refunds" do
    api("submitExpenses", [
      { "project" => "PRJ1", "type" => "Material", "particular" => "Gravel", "totalAmount" => "1,500.50" },
      { "project" => "PRJ1", "type" => "Others", "particular" => "H.O: Construction Bond", "totalAmount" => "20,000" }
    ], "admin@test.local")

    assert_equal 2, Expense.count
    assert_equal 1500.50, Expense.first.total_amount.to_f
    refund = PendingRefund.last
    assert_equal "Pending", refund.status
    assert_equal 20_000.0, refund.total_amount.to_f
  end

  test "refund credit flow is record-keeping only" do
    api("submitExpenses", [
      { "project" => "PRJ1", "type" => "Others", "particular" => "H.O: CONSTRUCTION BOND", "totalAmount" => "20000" }
    ], "admin@test.local")
    pending = api("getPendingRefunds")
    assert_equal 1, pending.length

    api("submitRefundCredit", pending[0]["rowIndex"], 18_000, "PRJ1", "H.O: CONSTRUCTION BOND", "admin@test.local")
    refund = PendingRefund.last.reload
    assert_equal "Refunded", refund.status
    assert_equal 18_000.0, refund.refunded_amount.to_f
    assert_empty api("getPendingRefunds")
    assert_equal 1, Expense.count # no contra-expense posted
  end

  test "expense summary combines budget, PO commitments, and manual expenses" do
    MrfItem.create!(item: "Cement", project_code: "PRJ1", mrf_code: "MRF-PRJ1-1",
                    status: "Approved", po_code: "PO-1")
    PurchaseOrderItem.create!(po_number: "PO-1", supplier: "ACME", item_name: "Cement",
                              quantity: 10, unit_price: 500, status: "Sent")
    PurchaseOrderItem.create!(po_number: "PO-1", supplier: "ACME", item_name: "Rebar",
                              quantity: 2, unit_price: 100, status: "Voided")
    Expense.create!(project_code: "PRJ1", total_amount: 1_000, encoder_email: "admin@test.local")

    body = api("getExpenseSummaryForProject", "PRJ1")
    assert_equal 100_000.0, body["totalBudget"]
    assert_equal 5_000.0, body["totalMrfUtilized"] # voided row excluded
    assert_equal 1_000.0, body["totalExpenses"]
    assert_equal 94_000.0, body["totalRemaining"]
  end

  test "my recent expenses is strictly filtered by encoder" do
    Expense.create!(project_code: "PRJ1", expense_type: "Labor", particular: "Crew",
                    total_amount: 500, encoder_email: "admin@test.local", entry_date: Time.current)
    Expense.create!(project_code: "PRJ1", expense_type: "Labor", particular: "Other",
                    total_amount: 700, encoder_email: "someone@else.local", entry_date: Time.current)
    rows = api("getMyRecentExpenses", "admin@test.local")
    assert_equal 1, rows.length
    assert_equal 500.0, rows[0]["totalAmount"]
  end

  test "expense types dictionary groups items under types" do
    ExpenseListEntry.create!(expense_type: "BIR", item_name: "BIR: VAT")
    ExpenseListEntry.create!(expense_type: "BIR", item_name: "COMMISSION")
    dict = api("getExpenseTypesAndItems")
    assert_equal ["BIR: VAT", "COMMISSION"], dict["BIR"]
  end
end
