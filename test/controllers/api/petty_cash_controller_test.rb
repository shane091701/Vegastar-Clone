require "test_helper"

class Api::PettyCashControllerTest < ActionDispatch::IntegrationTest
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

  def submit(type: "Expense", amount: 500)
    api("submitPettyCashRecord", {
      "project" => "PRJ1", "expenseType" => type, "particulars" => "Fuel",
      "amount" => amount,
      "file" => { "name" => "receipt.png", "mimeType" => "image/png",
                  "data" => Base64.strict_encode64("img") }
    }, "admin@test.local")
  end

  test "submitting a record stores the reimbursement with sequenced receipt name" do
    submit
    record = Reimbursement.last
    assert_equal "PRJ1", record.project_code
    assert record.receipt.attached?
    assert_equal "Petty_Cash_Expense_01.png", record.receipt.filename.to_s
    assert_match %r{\A/rails/active_storage/}, record.receipt_url

    submit
    assert_equal "Petty_Cash_Expense_02.png", Reimbursement.last.receipt.filename.to_s
  end

  test "missing file is rejected" do
    post "/api/submitPettyCashRecord",
         params: { args: [{ "project" => "PRJ1", "expenseType" => "Expense" }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/receipt file is required/, JSON.parse(response.body)["error"])
  end

  test "ledger aggregates records with filter option lists" do
    submit
    submit(type: "Replenishment", amount: 300)
    BoqItem.create!(project_code: "PRJ2", item: "x")

    body = api("getPCLedgerData")
    assert_equal 2, body["records"].length
    assert_equal ["PRJ1", "PRJ2"], body["projects"] # seeded from BOQ too
    assert_equal ["admin"], body["submitters"]
    assert_equal ["Expense", "Replenishment"], body["types"]
    assert_equal 300.0, body["records"][0]["amount"] # newest first
  end
end
