require "test_helper"

class Api::ReceivingControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json

    MrfItem.create!(item: "Cement", project_code: "PRJ1", mrf_code: "MRF-PRJ1-1",
                    status: "Approved", po_code: "PO-1")
    PurchaseOrderItem.create!(po_number: "PO-1", supplier: "ACME", item_name: "Cement",
                              quantity: 10, unit_price: 100, status: "Sent")
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "receiving data groups pending items by project and PO" do
    body = api("getReceivingData")
    assert_equal ["PRJ1"], body["projects"]
    item = body["pos"]["PRJ1"]["PO-1"][0]
    assert_equal 10.0, item["ordered"]
    assert_equal 0.0, item["received"]
    assert_equal 10.0, item["remaining"]
  end

  test "submitting a receiving logs deliveries and flips PO status" do
    api("submitReceivingToBackend", {
      "project" => "PRJ1", "docNum" => "DR-100", "email" => "admin@test.local",
      "poCode" => "PO-1", "items" => [{ "name" => "Cement", "qty" => 4, "remarks" => "ok" }]
    })
    delivery = Delivery.last
    assert_equal "DR-100", delivery.delivery_doc_number
    assert_equal 4.0, delivery.quantity.to_f
    assert_equal "Partial delivery", PoStatusCalculator.call("PO-1")

    body = api("getReceivingData")
    assert_equal 6.0, body["pos"]["PRJ1"]["PO-1"][0]["remaining"]

    api("submitReceivingToBackend", {
      "project" => "PRJ1", "docNum" => "DR-101", "email" => "admin@test.local",
      "poCode" => "PO-1", "items" => [{ "name" => "Cement", "qty" => 6 }]
    })
    assert_equal "Received all", PoStatusCalculator.call("PO-1")
    assert_empty api("getReceivingData")["projects"]
  end

  test "receipt upload produces the Receipt: url format" do
    png = Base64.strict_encode64("fakepngdata")
    api("submitReceivingToBackend", {
      "project" => "PRJ1", "docNum" => "DR-102", "email" => "admin@test.local",
      "poCode" => "PO-1",
      "receiptFile" => { "name" => "r.png", "mimeType" => "image/png", "data" => png },
      "items" => [{ "name" => "Cement", "qty" => 1 }]
    })
    assert_match(/\AReceipt: \/rails\/active_storage\//, Delivery.last.url_pictures)

    history = api("getReceivingHistoryData")
    assert_equal "DR-102", history[0]["docNum"]
    assert_equal "admin", history[0]["receiver"]
  end
end
