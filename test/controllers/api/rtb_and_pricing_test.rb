require "test_helper"

class Api::RtbAndPricingTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    Project.create!(code: "PRJ1", customer_name: "Juan", company: "SP Bedana", quoted_cost: 1_000_000)
    BoqItem.create!(project_code: "PRJ1", phase: "Civil", item: "Cement",
                    total_labor: 10_000, total_material: 40_000, total_cost: 50_000)
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "full RTB lifecycle: request, approve, collect" do
    body = api("getProjectEngineerData", "PRJ1")
    assert_equal "Juan", body["customerName"]
    assert_equal 1_000_000.0, body["quotedCost"]
    assert_equal ["Civil"], body["phases"]

    api("submitProjectProgress", { "projectCode" => "PRJ1", "overallPercent" => 45,
                                   "phaseBreakdown" => [{ "phase" => "Civil", "percent" => 45 }] },
        "admin@test.local")

    api("submitRTBRequest", { "projectCode" => "PRJ1", "rtbPercent" => 30 }, "admin@test.local")
    rtb = RtbLog.last
    assert_equal "RTB-PRJ1-001", rtb.rtb_code
    assert_equal 300_000.0, rtb.calculated_amount.to_f

    pending = api("getPendingRTBs")
    assert_equal 45.0, pending[0]["lastProgress"]
    assert_equal 300_000.0, pending[0]["amountToBill"]

    api("processRTB", "RTB-PRJ1-001", "Approve", "admin@test.local")
    assert_equal "Approved", rtb.reload.status

    approved = api("getApprovedRTBs")
    assert_equal ["RTB-PRJ1-001"], approved.map { |r| r["rtbId"] }

    api("submitCollection", { "rtbId" => "RTB-PRJ1-001", "projectCode" => "PRJ1",
                              "amount" => 300_000, "bank" => "BDO",
                              "dueDate" => "2026-08-01", "checkNumber" => "C-1" },
        "admin@test.local")
    assert_equal 1, Collection.count
    assert_empty api("getApprovedRTBs") # collected RTBs drop out
  end

  test "RTB validations" do
    post "/api/submitRTBRequest", params: { args: [{ "projectCode" => "PRJ1", "rtbPercent" => 150 }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/between 1 and 100/, JSON.parse(response.body)["error"])

    post "/api/submitRTBRequest", params: { args: [{ "projectCode" => "GHOST", "rtbPercent" => 10 }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/No Quoted Cost found/, JSON.parse(response.body)["error"])
  end

  test "pricing data injects whichever-is-higher rows and CGT after LOT COST" do
    ExpenseListEntry.create!(expense_type: "Land", item_name: "LOT COST")
    Expense.create!(project_code: "PRJ1", expense_type: "Land", particular: "LOT COST",
                    total_amount: 2_000_000, encoder_email: "admin@test.local")

    data = api("getProjectPricingData", "PRJ1")
    assert_equal 40_000.0, data["Construction Materials"]["amount"] # BOQ > actual
    assert_equal 10_000.0, data["Payroll"]["amount"]
    assert_equal 50_000.0, data["Materials + Payroll"]["amount"]

    land_items = data["Land"]["lineItems"].map { |li| li["name"] }
    lot_idx = land_items.index("LOT COST")
    assert_equal "Capital Gains Tax (CGT) - 6%", land_items[lot_idx + 1]
    cgt = data["Land"]["lineItems"][lot_idx + 1]
    assert_in_delta 120_000.0, cgt["amount"], 0.01
    assert cgt["isReadOnly"]
    assert_in_delta 2_120_000.0, data["Land"]["amount"], 0.01

    api("savePricingSimulation", { "project" => "PRJ1", "items" => [
      { "type" => "Land", "lineItem" => "LOT COST", "percentage" => 15, "override" => "" }
    ] }, "admin@test.local")

    data = api("getProjectPricingData", "PRJ1")
    lot = data["Land"]["lineItems"].find { |li| li["name"] == "LOT COST" }
    assert_equal 15.0, lot["savedPct"]
  end
end
