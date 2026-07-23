require "test_helper"

class Api::CanvasControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json

    @mrf = MrfItem.create!(entry_date: Time.current, item: "Cement", unit: "bags",
                           request_amount: 10, project_code: "PRJ1", phase: "Civil",
                           status: "Approved", approved_qty: 8, mrf_code: "MRF-PRJ1-1",
                           requester_email: "admin@test.local")
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    assert_response :success, response.body
    JSON.parse(response.body)
  end

  test "pending quote MRFs lists approved items without POs" do
    body = api("getPendingQuoteMRFs")
    assert_equal ["PRJ1"], body["projects"]
    assert_equal({ "MRF-PRJ1-1" => "PRJ1" }, body["mrfMap"])
    assert_equal 8.0, body["items"][0]["qty"]

    @mrf.update!(po_code: "PO-X")
    assert_empty api("getPendingQuoteMRFs")["items"]
  end

  test "saving quotes stores quote rows and percentage-suffixed terms" do
    api("saveSupplierQuotes", "MRF-PRJ1-1", "ACME",
        [{ "item" => "Cement", "amount" => 4000, "brand" => "Holcim" }],
        [{ "description" => "30 days", "percentage" => 100 }],
        "admin@test.local", 250)
    quote = SupplierQuote.last
    assert_equal "ACME", quote.supplier
    assert_equal "Holcim", quote.brand
    assert_equal "250.0", quote.delivery_fee
    assert_equal "100%", PaymentTerm.last.percentage
  end

  test "canvas pivot returns quotes per supplier and budget remaining" do
    BoqItem.create!(project_code: "PRJ1", phase: "Civil", item: "Cement", qty: 100,
                    uom: "bags", total_material: 50_000, labor_cost_k: 10_000)
    api("saveSupplierQuotes", "MRF-PRJ1-1", "ACME",
        [{ "item" => "cement", "amount" => 4000, "brand" => "" }], [], "admin@test.local", 0)

    body = api("getCanvasPivotData", "MRF-PRJ1-1")
    assert_equal ["ACME"], body["suppliers"]
    item = body["items"][0]
    assert_equal "Cement", item["desc"]
    assert_equal({ "amount" => 4000.0, "brand" => "" }, item["quotes"]["ACME"]) # case-insensitive item match
    assert_equal 60_100.0, item["remainingCost"]       # 100 qty + 50k mat + 10k labor
  end

  test "canvas pivot includes each supplier's brand and delivery fee for comparison" do
    BoqItem.create!(project_code: "PRJ1", phase: "Civil", item: "Cement", qty: 100,
                    uom: "bags", total_material: 50_000, labor_cost_k: 10_000)
    # Anna: "delivery fee hindi sya nattake into account when comparing quotations
    # sa canvas sheet" / "pati yung brands nawala sa canvas sheet" -- both the fee
    # and the brand were saved but never sent back to the Canvas & Award screen.
    api("saveSupplierQuotes", "MRF-PRJ1-1", "ACME",
        [{ "item" => "cement", "amount" => 4000, "brand" => "Holcim" }], [], "admin@test.local", 250)

    body = api("getCanvasPivotData", "MRF-PRJ1-1")
    item = body["items"][0]
    assert_equal({ "amount" => 4000.0, "brand" => "Holcim" }, item["quotes"]["ACME"])
    assert_equal({ "ACME" => 250.0 }, body["deliveryFees"])
  end

  test "awarding winners creates one PO per supplier with back-calculated prices" do
    MrfItem.create!(entry_date: Time.current, item: "Rebar", unit: "pcs",
                    request_amount: 5, project_code: "PRJ1", phase: "Civil",
                    status: "Approved", approved_qty: 5, mrf_code: "MRF-PRJ1-1",
                    requester_email: "admin@test.local")

    result = PdfGenerator.stub(:store, "/pdf/stub.pdf") do
      api("awardCanvasWinners", "MRF-PRJ1-1", [
        { "item" => "Cement", "supplier" => "ACME", "qty" => 8, "amount" => 4000 },
        { "item" => "Rebar", "supplier" => "BuildCo", "qty" => 0, "amount" => 1500 }
      ], "admin@test.local")
    end
    assert_equal "Successfully generated 2 Purchase Orders!", result

    cement_po = PurchaseOrderItem.find_by(item_name: "Cement")
    assert_equal 500.0, cement_po.unit_price.to_f # 4000 / 8
    assert_equal "Draft", cement_po.status
    assert_match(/\APO-#{Date.current.strftime('%m%d%y')}-\d{3}-[A-Z0-9]{3}\z/, cement_po.po_number)

    lot_po = PurchaseOrderItem.find_by(item_name: "Rebar")
    assert_equal 1.0, lot_po.quantity.to_f       # qty 0 becomes 1
    assert_equal 1500.0, lot_po.unit_price.to_f

    assert_equal "Win", @mrf.reload.win_loss
    assert_equal cement_po.po_number, @mrf.po_code
    assert_equal 4000.0, @mrf.request_amount.to_f # history updated with subtotal
    assert_equal "/pdf/stub.pdf", @mrf.pdf_url
  end

  test "a PO PDF failure for one supplier doesn't block the rest of the same award batch" do
    MrfItem.create!(entry_date: Time.current, item: "Rebar", unit: "pcs",
                    request_amount: 5, project_code: "PRJ1", phase: "Civil",
                    status: "Approved", approved_qty: 5, mrf_code: "MRF-PRJ1-1",
                    requester_email: "admin@test.local")

    call_count = 0
    flaky_store = lambda do |*|
      call_count += 1
      raise "storage unavailable" if call_count == 1
      "/pdf/stub.pdf"
    end

    result = PdfGenerator.stub(:store, flaky_store) do
      api("awardCanvasWinners", "MRF-PRJ1-1", [
        { "item" => "Cement", "supplier" => "ACME", "qty" => 8, "amount" => 4000 },
        { "item" => "Rebar", "supplier" => "BuildCo", "qty" => 0, "amount" => 1500 }
      ], "admin@test.local")
    end

    assert_equal "Successfully generated 2 Purchase Orders!", result
    assert PurchaseOrderItem.find_by(item_name: "Cement"),
      "the first supplier's PO must still be created even though its PDF generation failed"
    assert PurchaseOrderItem.find_by(item_name: "Rebar"),
      "the second supplier must still be processed after the first supplier's PDF failure"
    assert_equal "Win", MrfItem.find_by(item: "Rebar").win_loss
  end

  test "canvas MRF list reflects PO state" do
    SupplierQuote.create!(mrf_code: "MRF-PRJ1-1", item: "Cement", supplier: "ACME", amount: 1)
    list = api("getCanvasMRFList")
    assert_equal [{ "mrfId" => "MRF-PRJ1-1", "project" => "PRJ1", "hasPo" => false }], list
  end
end
