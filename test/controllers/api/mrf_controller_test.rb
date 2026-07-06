require "test_helper"

class Api::MrfControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    @user = User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json

    BoqItem.create!(project_code: "PRJ1", phase: "Civil", scope: "1.1", item: "Cement",
                    qty: 100, uom: "bags", total_material: 50_000, labor_cost_k: 10_000)
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    response.body == "null" ? nil : JSON.parse(response.body)
  end

  def submit_sample_request
    api("submitRequest", [
      { "project" => "PRJ1", "phase" => "Civil", "item" => "Cement",
        "unit" => "bags", "qty" => 10, "remarks" => "urgent" }
    ], "admin@test.local")
  end

  test "submitRequest creates mrf items, out ledger entries, and emails approvers" do
    assert_emails 1 do
      submit_sample_request
    end
    mrf = MrfItem.last
    assert_equal "MRF-PRJ1-1", mrf.mrf_code
    assert_equal "Pending", mrf.status
    assert_equal "1.1", mrf.scope
    assert_equal "urgent", mrf.remarks

    out = OutLedgerEntry.last
    assert_equal "MRF-PRJ1-1-Cement", out.control_code
    assert_equal "Material Request", out.movement_type
    assert_equal 10.0, out.amount.to_f
    assert_nil out.lot_amount
  end

  test "submitRequest sequences codes per project" do
    submit_sample_request
    MrfItem.last.update!(status: "Approved")
    submit_sample_request
    assert_equal "MRF-PRJ1-2", MrfItem.last.mrf_code
  end

  test "submitRequest rejects empty payloads" do
    post "/api/submitRequest", params: { args: [[], "admin@test.local"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/No items valid/, JSON.parse(response.body)["error"])
  end

  test "approval queue groups pending items and computes remaining" do
    submit_sample_request
    body = api("getApprovalQueueData")
    assert_equal ["PRJ1"], body["projects"]
    assert_equal 1, body["requests"].length
    group = body["requests"][0]
    assert_equal "MRF-PRJ1-1", group["id"]
    item = group["items"][0]
    assert_equal 100.0, item["budget"]
    # remaining = budget - (used - reqQty) = 100 - (10 - 10)
    assert_equal 100.0, item["remainingBeforeApprove"]
  end

  test "approve updates status, out ledger, and generates RFQ when PDF available" do
    submit_sample_request
    if PdfGenerator.available?
      url = api("processApproval", "MRF-PRJ1-1", "Approve", ["ok"], [8], [], "admin@test.local", ["Holcim"])
      assert url.is_a?(String) && url.include?("/rails/active_storage/")
      assert_equal url, MrfItem.last.pdf_url
    else
      post "/api/processApproval",
           params: { args: ["MRF-PRJ1-1", "Approve", ["ok"], [8], [], "admin@test.local", ["Holcim"]] }, as: :json
    end
    mrf = MrfItem.last.reload
    assert_equal "Approved", mrf.status
    assert_equal 8.0, mrf.approved_qty.to_f
    assert_equal "Holcim", mrf.preferred_brands
    assert_equal 8.0, OutLedgerEntry.last.amount.to_f
  end

  test "reject removes the out ledger entry" do
    submit_sample_request
    api("processApproval", "MRF-PRJ1-1", "Reject", [], [], [], "admin@test.local", [])
    assert_equal "Rejected", MrfItem.last.status
    assert_equal 0, OutLedgerEntry.count
  end

  test "voidAlphaRFQ restores budget and refuses when PO exists" do
    submit_sample_request
    MrfItem.last.update!(status: "Approved", pdf_url: "/x.pdf")

    MrfItem.last.update!(po_code: "PO-1")
    post "/api/voidAlphaRFQ", params: { args: ["MRF-PRJ1-1", "dup", "admin@test.local"] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Action Denied/, JSON.parse(response.body)["error"])

    MrfItem.last.update!(po_code: "")
    msg = api("voidAlphaRFQ", "MRF-PRJ1-1", "dup", "admin@test.local")
    assert_match(/has been voided and 1 item/, msg)
    assert_equal "Voided", MrfItem.last.status
    assert_match(/VOIDED/, MrfItem.last.remarks)
    assert_equal 0, OutLedgerEntry.count
  end

  test "returnable request and approval flow" do
    api("submitReturnableRequest",
        { "project" => "PRJ1", "items" => [{ "item" => "Scaffolding", "qty" => 4 }] },
        "admin@test.local")
    assert_equal 1, ReturnableItem.where(status: "Pending").count

    queue = api("getApprovalQueueData")
    ret_group = queue["requests"].find { |g| g["id"] == "RET-PRJ1" }
    assert_equal "RETURNABLE TOOL", ret_group["items"][0]["phase"]

    msg = api("processApproval", "RET-PRJ1", "Approve", [], [3], [], "admin@test.local", [])
    assert_match(/Processed Returnable Items/, msg)
    ret = ReturnableItem.last.reload
    assert_equal "Approved", ret.status
    assert_equal 3.0, ret.quantity.to_f

    rows = api("getReturnableItemsData")
    assert_equal "admin", rows[0]["requester"]
  end

  test "request history returns newest first" do
    submit_sample_request
    rows = api("getRequestHistory")
    assert_equal 1, rows.length
    assert_equal "Cement", rows[0]["item"]
    assert_equal "MRF-PRJ1-1", rows[0]["mrfCode"]
  end
end
