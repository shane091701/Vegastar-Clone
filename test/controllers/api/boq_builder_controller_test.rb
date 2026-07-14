require "test_helper"

class Api::BoqBuilderControllerTest < ActionDispatch::IntegrationTest
  PAYLOAD = {
    "project" => { "code" => "NB1", "customerName" => "Juan", "company" => "SP Bedana",
                   "quotedCost" => "100000", "milestoneTerms" => [] },
    "items" => [
      { "phase" => "Civil", "scope" => "Foundation", "name" => "Concrete", "unit" => "cu.m",
        "qty" => 10, "laborCost" => 100, "materialCost" => 400, "totalCost" => 5000, "quotedCost" => 6750 },
      { "phase" => "Civil", "scope" => "Foundation", "name" => "Rebar", "unit" => "pcs",
        "qty" => 2, "laborCost" => 50, "materialCost" => 150, "totalCost" => 0, "quotedCost" => 0 }
    ]
  }.freeze

  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    @user = User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "submit creates a pending submission with sequential code" do
    body = api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")
    assert body["success"]
    assert_equal "BOQ-#{Date.current.strftime('%Y%m%d')}-001", body["submissionId"]
    assert_equal "Pending", BoqSubmission.last.status
  end

  test "pending approvals computes grand total with fallback item math" do
    api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")
    rows = api("getPendingBoqApprovals")
    assert_equal 1, rows.length
    # 5000 explicit + (50+150)*2 fallback = 5400
    assert_in_delta 5400.0, rows[0]["grandTotal"], 0.01
    assert_equal 2, rows[0]["itemCount"]
    assert_equal "Juan", rows[0]["customerName"]
  end

  test "accept writes boq_items and project, marks approved" do
    sub_id = api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")["submissionId"]
    assert_equal "Success", api("processBoqApproval", sub_id, "Accept", "")
    submission = BoqSubmission.find_by(submission_code: sub_id)
    assert_equal "Approved", submission.status
    assert_equal "admin@test.local", submission.action_by
    assert_equal 2, BoqItem.where(project_code: "NB1").count
    assert Project.exists?(code: "NB1")
    concrete = BoqItem.find_by(item: "Concrete")
    assert_equal 100.0, concrete.total_labor.to_f      # laborCost -> Col I slot
    assert_equal 400.0, concrete.total_material.to_f   # materialCost -> Col J slot
    assert_equal 5000.0, concrete.total_cost.to_f
    assert_equal 6750.0, concrete.unit_material_cost.to_f # quotedCost -> Col F slot
    assert_equal "Native BOQ", concrete.source_file
  end

  test "return requires remarks and resubmission flow works" do
    sub_id = api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")["submissionId"]

    post "/api/processBoqApproval", params: { args: [sub_id, "Return", ""] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Remarks are required/, JSON.parse(response.body)["error"])

    assert_equal "Success", api("processBoqApproval", sub_id, "Return", "Fix pricing")
    assert_equal "Returned", BoqSubmission.last.status
    assert_equal "Fix pricing", BoqSubmission.last.admin_remarks

    api("markBoqSubmissionResubmitted", sub_id)
    assert_equal "Resubmitted", BoqSubmission.last.status
  end

  test "already processed submissions cannot be re-actioned" do
    sub_id = api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")["submissionId"]
    api("processBoqApproval", sub_id, "Reject", "")
    post "/api/processBoqApproval", params: { args: [sub_id, "Accept", ""] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/already been processed/, JSON.parse(response.body)["error"])
  end

  test "accept rejects duplicate project codes at accept time" do
    sub_id = api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")["submissionId"]
    Project.create!(code: "NB1")
    post "/api/processBoqApproval", params: { args: [sub_id, "Accept", ""] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/already exists/, JSON.parse(response.body)["error"])
  end

  test "builder data returns phase scope map and materials" do
    BoqItem.create!(project_code: "P1", phase: "Civil", scope: "1.1", item: "x")
    BoqItem.create!(project_code: "P1", phase: "Civil", scope: "1.2", item: "y")
    Material.create!(item_name: "Cement", unit: "bag", quoted_cost: 260)
    body = api("getBoqBuilderData")
    assert_equal({ "Civil" => ["1.1", "1.2"] }, body["phaseScopeMap"])
    assert_equal [{ "name" => "Cement", "unit" => "bag", "quotedCost" => 260.0 }], body["materialsList"]
  end

  test "my submissions filters by submitter" do
    api("submitNativeBoqForApproval", PAYLOAD, "admin@test.local")
    rows = api("getMyBoqSubmissions", "admin@test.local")
    assert_equal 1, rows.length
    assert_equal [], api("getMyBoqSubmissions", "other@test.local")
  end
end
