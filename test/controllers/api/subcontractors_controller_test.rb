require "test_helper"

class Api::SubcontractorsControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    User.create!(name: "Bean Counter", email: "acct@test.local", role: "accounting", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  def create_sub
    api("saveSubcontractor", { "name" => "BuildRight Corp", "tin" => "123", "contact" => "0917" }, "admin@test.local")
  end

  def create_wp(contract_value: 10_000)
    create_sub
    api("saveWorkPackage", {
      "project" => "PRJ1", "subId" => "SUB-00001", "label" => "Masonry Works",
      "basis" => "labor", "contractValue" => contract_value,
      "lines" => [
        { "phase" => "Civil", "scope" => "1.1", "item" => "Wall A", "costLabor" => 3000, "costMaterial" => 100, "costTotal" => 3100 },
        { "phase" => "Civil", "scope" => "1.1", "item" => "Wall B", "costLabor" => 1000, "costMaterial" => 200, "costTotal" => 1200 }
      ],
      "milestones" => [
        { "seq" => 1, "label" => "Mobilization", "targetPct" => 25, "paymentPct" => 40 },
        { "seq" => 2, "label" => "Completion", "targetPct" => 100, "paymentPct" => 60 }
      ]
    }, "admin@test.local")
  end

  test "subcontractor CRUD with duplicate guard and audit trail" do
    body = create_sub
    assert_equal "SUB-00001", body["subId"]
    assert SubconAudit.exists?(entity: "Subcontractor", action: "create")

    post "/api/saveSubcontractor", params: { args: [{ "name" => "buildright corp" }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/already exists/, JSON.parse(response.body)["error"])

    toggled = api("toggleSubcontractorActive", "SUB-00001", "admin@test.local")
    refute toggled["active"]
  end

  test "work package creation prorates allocation and creates milestones" do
    body = create_wp
    assert_equal "WP-00001", body["wpId"]
    assert_equal 2, body["saved"]

    # labor basis: selected sum = 4000, multiplier 2.5
    wall_a = WpBoqLine.find_by(item: "Wall A")
    assert_equal 3000.0, wall_a.boq_cost.to_f
    assert_equal 7500.0, wall_a.allocated_cost.to_f

    milestones = SubconMilestone.order(:seq)
    assert_equal ["MIL-00001", "MIL-00002"], milestones.map(&:milestone_code)
    assert_equal 4000.0, milestones.first.amount.to_f  # 40% of 10k
    assert_equal 6000.0, milestones.last.amount.to_f
  end

  test "work package validations: claimed lines and payment percentages" do
    create_wp
    post "/api/saveWorkPackage", params: { args: [{
      "project" => "PRJ1", "subId" => "SUB-00001", "label" => "Dup", "basis" => "labor",
      "contractValue" => 500,
      "lines" => [{ "phase" => "Civil", "scope" => "1.1", "item" => "Wall A", "costLabor" => 3000 }],
      "milestones" => [{ "seq" => 1, "label" => "All", "targetPct" => 100, "paymentPct" => 100 }]
    }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/already assigned/, JSON.parse(response.body)["error"])

    create_sub rescue nil
    post "/api/saveWorkPackage", params: { args: [{
      "project" => "PRJ2", "subId" => "SUB-00001", "label" => "Bad", "basis" => "labor",
      "contractValue" => 500,
      "lines" => [{ "phase" => "P", "scope" => "S", "item" => "I", "costLabor" => 100 }],
      "milestones" => [{ "seq" => 1, "label" => "Half", "targetPct" => 50, "paymentPct" => 50 }]
    }, "x"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/must sum to exactly 100/, JSON.parse(response.body)["error"])
  end

  test "report auto-flags milestones at target and emails accounting" do
    create_wp
    body = nil
    assert_emails 1 do
      body = api("submitSubconReport", {
        "wpId" => "WP-00001", "project" => "PRJ1", "paymentTerm" => "Mobilization",
        "percentComplete" => 30, "narrative" => "Blocks laid"
      }, "admin@test.local")
    end
    assert_equal ["MIL-00001"], body["flagged"] # 25% target met, 100% not
    assert SubconMilestone.find_by(milestone_code: "MIL-00001").ready_to_pay
    refute SubconMilestone.find_by(milestone_code: "MIL-00002").ready_to_pay
    assert_equal "RPT-00001", body["reportId"]
  end

  test "check linking drives derived statuses including voided-check reversion" do
    create_wp
    api("submitSubconReport", { "wpId" => "WP-00001", "project" => "PRJ1",
                                "percentComplete" => 30, "narrative" => "x" }, "admin@test.local")
    check = Check.create!(check_date: Date.current, project_name: "BuildRight advance",
                          bank: "BDO", check_number: "CHK-100", amount: 4000,
                          status: "Not Deposited")

    linkable = api("getLinkableChecksForSub", "SUB-00001")
    assert_equal ["CHK-100"], linkable.map { |c| c["checkNumber"] } # sub-name match on project

    api("linkCheckToMilestone", "MIL-00001", "CHK-100", "admin@test.local")
    mil = SubconMilestone.find_by(milestone_code: "MIL-00001")
    assert_equal "CHK-100", mil.check_number
    refute mil.ready_to_pay

    ap = api("getSubconApData", {})
    paid_row = ap["rows"].find { |r| r["milId"] == "MIL-00001" }
    assert_equal "Paid", paid_row["status"]
    assert_equal 1, ap["kpi"]["paid"]["count"]

    check.update!(status: "Voided")
    ap = api("getSubconApData", {})
    row = ap["rows"].find { |r| r["milId"] == "MIL-00001" }
    assert_equal "Ready to Pay", row["status"]
    assert_match(/voided/, row["statusNote"])

    api("unlinkCheckFromMilestone", "MIL-00001", "admin@test.local")
    assert_equal "", SubconMilestone.find_by(milestone_code: "MIL-00001").check_number
  end

  test "budget vs actual and payables views" do
    create_wp
    api("markMilestoneReady", "MIL-00001", "admin@test.local")

    payables = api("getSubconPayables")
    assert_equal ["MIL-00001"], payables.map { |p| p["milId"] }

    budget = api("getSubconBudgetData", "")
    row = budget["rows"][0]
    assert_equal 4000.0, row["boqBudget"]       # labor-basis boq costs
    assert_equal 10_000.0, row["contractValue"]
    assert_equal(-6000.0, row["variance"])
    assert_equal 0.0, row["paid"]
  end
end
