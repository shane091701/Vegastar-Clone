# Step definitions for features/mrf_to_delivery.feature.
#
# This app is a JSON RPC-style API (POST /api/<action> with { args: [...] }),
# not a page-based UI, so steps call the API directly the same way
# test/controllers/api/*_test.rb does, via ActionDispatch::IntegrationTest's
# `post`/`response` (Cucumber::Rails::World already inherits from it).
#
# PdfGenerator.store/render_pdf shell out to a real Chromium browser (ferrum),
# same as production. Since there's no guarantee one is installed on every
# machine running the suite, PDF generation is stubbed here exactly like the
# existing test/controllers/api/canvas_controller_test.rb does with
# `PdfGenerator.stub(:store, ...)`.

# ---------------------------------------------------------------------------
# Generic API call helpers
# ---------------------------------------------------------------------------

def api_post(fn, *fn_args)
  post "/api/#{fn}", params: { args: fn_args }, as: :json
  if response.successful?
    @last_result = response.body == "null" ? nil : JSON.parse(response.body)
    @last_error = nil
  else
    @last_result = nil
    @last_error = (JSON.parse(response.body)["error"] rescue response.body)
  end
  @last_result
end

def api_post!(fn, *fn_args)
  api_post(fn, *fn_args)
  raise "API call ##{fn} failed: #{@last_error}" if @last_error
  @last_result
end

# ---------------------------------------------------------------------------
# Background / setup steps
# ---------------------------------------------------------------------------

Given("the following users exist:") do |table|
  @user_passwords ||= {}
  RolePermission.find_or_create_by!(role: "admin") { |r| r.allowed_tabs = "admin" }
  RolePermission.find_or_create_by!(role: "approver") { |r| r.allowed_tabs = "approver" }

  table.hashes.each do |row|
    User.create!(name: row["name"], email: row["email"], role: row["role"], password: row["password"])
    @user_passwords[row["email"]] = row["password"]
  end
end

Given("a BOQ budget exists for project {string} phase {string} item {string} with quantity {int} uom {string}, material cost {int}, labor cost {int}") do
  |project, phase, item, qty, uom, material_cost, labor_cost|
  BoqItem.create!(project_code: project, phase: phase, item: item, scope: "1.1",
                  qty: qty, uom: uom, total_material: material_cost, labor_cost_k: labor_cost)
end

Given("a supplier {string} exists with email {string}") do |name, email|
  Supplier.create!(company_name: name, email: email)
end

Given("I am logged in as {string}") do |email|
  password = @user_passwords && @user_passwords[email]
  raise "no known password for #{email.inspect} -- add it to the users table first" unless password

  api_post!("verifyLogin", email, password)
  raise "login did not return authorized: true (#{@last_result.inspect})" unless @last_result["authorized"]
  @current_email = email
end

# ---------------------------------------------------------------------------
# MRF submission / approval / rejection / RFQ void
# ---------------------------------------------------------------------------

def submit_mrf(project:, phase:, item:, unit:, qty:, remarks: "")
  api_post("submitRequest", [
    { "project" => project, "phase" => phase, "item" => item, "unit" => unit,
      "qty" => qty, "remarks" => remarks }
  ], @current_email)
  @project = project
  @item_name = item
  @mrf_code = MrfItem.where(project_code: project, item: item).order(:id).last&.mrf_code
end

def approve_mrf(qty:, brand: "", remarks: "ok")
  PdfGenerator.stub(:store, "/pdf/rfq_stub.pdf") do
    api_post("processApproval", @mrf_code, "Approve", [remarks], [qty], [], @current_email, [brand])
  end
end

When("I submit an MRF request for project {string} phase {string} item {string} unit {string} quantity {int}") do
  |project, phase, item, unit, qty|
  submit_mrf(project: project, phase: phase, item: item, unit: unit, qty: qty)
end

When("I submit an MRF request for project {string} phase {string} item {string} unit {string} quantity {int} with remarks {string}") do
  |project, phase, item, unit, qty, remarks|
  submit_mrf(project: project, phase: phase, item: item, unit: unit, qty: qty, remarks: remarks)
end

When("I submit an MRF request with an empty item list") do
  api_post("submitRequest", [], @current_email)
end

When("I approve the MRF request with quantity {int} and brand {string}") do |qty, brand|
  approve_mrf(qty: qty, brand: brand)
end

When("I reject the MRF request") do
  api_post("processApproval", @mrf_code, "Reject", [], [], [], @current_email, [])
end

When("I void the RFQ with reason {string}") do |reason|
  api_post("voidAlphaRFQ", @mrf_code, reason, @current_email)
end

Then("the MRF item {string} should have status {string}") do |item, status|
  mrf = MrfItem.where(mrf_code: @mrf_code, item: item).first
  raise "no MrfItem found for mrf_code=#{@mrf_code.inspect} item=#{item.inspect}" unless mrf
  unless mrf.status == status
    raise "expected MrfItem status #{status.inspect}, got #{mrf.status.inspect}"
  end
end

Then("the MRF item {string} should have an RFQ PDF generated") do |item|
  mrf = MrfItem.where(mrf_code: @mrf_code, item: item).first
  raise "expected pdf_url to be present on MrfItem #{item.inspect}" if mrf.pdf_url.blank?
end

Then("there should be no out ledger entries") do
  count = OutLedgerEntry.count
  raise "expected 0 OutLedgerEntry rows, got #{count}" unless count.zero?
end

# ---------------------------------------------------------------------------
# Canvassing / award
# ---------------------------------------------------------------------------

When("I save a supplier quote from {string} for item {string} amount {int} brand {string}") do
  |supplier, item, amount, brand|
  api_post("saveSupplierQuotes", @mrf_code, supplier,
           [{ "item" => item, "amount" => amount, "brand" => brand }], [], @current_email, 0)
end

def award_canvas(winners)
  PdfGenerator.stub(:store, "/pdf/po_stub.pdf") do
    api_post("awardCanvasWinners", @mrf_code, winners, @current_email)
  end
  @po_code = MrfItem.where(mrf_code: @mrf_code, item: @item_name).first&.po_code
end

When("I award the canvas to:") do |table|
  winners = table.hashes.map do |row|
    { "supplier" => row["supplier"], "item" => row["item"],
      "qty" => row["qty"].to_f, "amount" => row["amount"].to_f }
  end
  award_canvas(winners)
end

Then("a purchase order should exist for {string} with status {string}") do |supplier, status|
  po = PurchaseOrderItem.where(po_number: @po_code, supplier: supplier).first
  raise "no PurchaseOrderItem found for po_code=#{@po_code.inspect} supplier=#{supplier.inspect}" unless po
  unless po.status == status
    raise "expected PurchaseOrderItem status #{status.inspect}, got #{po.status.inspect}"
  end
end

Then("no purchase order should have been created for {string}") do |item|
  exists = PurchaseOrderItem.where(item_name: item).exists?
  raise "expected no PurchaseOrderItem for #{item.inspect}, but one exists" if exists
end

# ---------------------------------------------------------------------------
# Purchase order dispatch / void
# ---------------------------------------------------------------------------

When("I dispatch the purchase order") do
  PdfGenerator.stub(:render_pdf, "%PDF-FAKE-BYTES%") do
    api_post("dispatchAlphaPO", @po_code, @current_email)
  end
end

When("I void the purchase order with reason {string}") do |reason|
  api_post("voidAlphaPO", @po_code, reason, @current_email)
end

Then("the purchase order status should be {string}") do |status|
  actual = PoStatusCalculator.call(@po_code)
  raise "expected computed PO status #{status.inspect}, got #{actual.inspect}" unless actual == status
end

Then("the MRF item {string} should be available for canvassing again") do |item|
  api_post!("getPendingQuoteMRFs")
  match = @last_result["items"].find { |i| i["mrfId"] == @mrf_code && i["description"] == item }
  raise "expected #{item.inspect} to be back in the canvassing pool, got #{@last_result['items'].inspect}" unless match
end

# ---------------------------------------------------------------------------
# Receiving / delivery
# ---------------------------------------------------------------------------

When("I record a delivery of {int} units of {string} against the purchase order") do |qty, item|
  @delivery_seq = (@delivery_seq || 0) + 1
  api_post("submitReceivingToBackend", {
    "project" => @project, "docNum" => "DR-#{@delivery_seq}",
    "email" => @current_email, "poCode" => @po_code,
    "items" => [{ "name" => item, "qty" => qty }]
  })
end

Then("{int} units of {string} should remain to be received on the purchase order") do |qty, item|
  api_post!("getReceivingData")
  row = (@last_result.dig("pos", @project, @po_code) || []).find { |r| r["name"] == item }
  raise "expected #{item.inspect} to still be in the receiving queue for PO #{@po_code}" unless row
  unless row["remaining"].to_f == qty.to_f
    raise "expected remaining #{qty}, got #{row['remaining']}"
  end
end

Then("the purchase order should no longer appear in the receiving queue") do
  api_post!("getReceivingData")
  po_list = @last_result.dig("pos", @project, @po_code)
  raise "expected PO #{@po_code} to be gone from the receiving queue, got #{po_list.inspect}" if po_list.present?
end

# ---------------------------------------------------------------------------
# Compound "Given" setup steps -- build straight to a mid-flow state without
# re-typing every intermediate step in every scenario that only cares about
# what happens *after* that point.
# ---------------------------------------------------------------------------

Given("an MRF has been submitted and approved for {string} quantity {int}") do |item, qty|
  submit_mrf(project: "PRJ1", phase: "Civil", item: item, unit: "bags", qty: qty)
  raise "setup: submitRequest failed: #{@last_error}" if @last_error
  approve_mrf(qty: qty, brand: "")
  raise "setup: processApproval failed: #{@last_error}" if @last_error
end

Given("an MRF has been submitted, approved, and awarded to {string} for {string} quantity {int} amount {int}") do
  |supplier, item, qty, amount|
  submit_mrf(project: "PRJ1", phase: "Civil", item: item, unit: "bags", qty: qty)
  raise "setup: submitRequest failed: #{@last_error}" if @last_error
  approve_mrf(qty: qty, brand: "")
  raise "setup: processApproval failed: #{@last_error}" if @last_error
  award_canvas([{ "supplier" => supplier, "item" => item, "qty" => qty.to_f, "amount" => amount.to_f }])
  raise "setup: awardCanvasWinners failed: #{@last_error}" if @last_error
end

Given("an MRF has been submitted, approved, dispatched to {string} for {string} quantity {int} amount {int}") do
  |supplier, item, qty, amount|
  submit_mrf(project: "PRJ1", phase: "Civil", item: item, unit: "bags", qty: qty)
  raise "setup: submitRequest failed: #{@last_error}" if @last_error
  approve_mrf(qty: qty, brand: "")
  raise "setup: processApproval failed: #{@last_error}" if @last_error
  award_canvas([{ "supplier" => supplier, "item" => item, "qty" => qty.to_f, "amount" => amount.to_f }])
  raise "setup: awardCanvasWinners failed: #{@last_error}" if @last_error
  PdfGenerator.stub(:render_pdf, "%PDF-FAKE-BYTES%") do
    api_post("dispatchAlphaPO", @po_code, @current_email)
  end
  raise "setup: dispatchAlphaPO failed: #{@last_error}" if @last_error
end

# ---------------------------------------------------------------------------
# Returnable items (tools/equipment) -- a separate track that never touches
# purchase orders or deliveries.
# ---------------------------------------------------------------------------

When("I submit a returnable request for project {string} item {string} quantity {int}") do |project, item, qty|
  api_post("submitReturnableRequest", { "project" => project, "items" => [{ "item" => item, "qty" => qty }] },
           @current_email)
  @returnable_project = project
end

Then("the returnable item {string} should have status {string}") do |item, status|
  ret = ReturnableItem.where(project_code: @returnable_project, item_name: item).order(:id).last
  raise "no ReturnableItem found for #{item.inspect}" unless ret
  raise "expected status #{status.inspect}, got #{ret.status.inspect}" unless ret.status == status
end

When("I approve the returnable request with quantity {int}") do |qty|
  api_post("processApproval", "RET-#{@returnable_project}", "Approve", [], [qty], [], @current_email, [])
end

When("I reject the returnable request") do
  api_post("processApproval", "RET-#{@returnable_project}", "Reject", [], [], [], @current_email, [])
end

# ---------------------------------------------------------------------------
# Generic success/failure assertions
# ---------------------------------------------------------------------------

Then("the request should succeed") do
  raise "expected the last API call to succeed, but it failed with: #{@last_error}" if @last_error
end

Then("the request should fail with an error matching {string}") do |snippet|
  raise "expected the last API call to fail, but it succeeded with: #{@last_result.inspect}" unless @last_error
  unless @last_error.include?(snippet)
    raise "expected error to include #{snippet.inspect}, got #{@last_error.inspect}"
  end
end
