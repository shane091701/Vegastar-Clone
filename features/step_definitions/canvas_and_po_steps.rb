# Step definitions for features/canvas_and_purchase_orders.feature.
#
# Reuses api_post/api_post!, the "Given the following users exist:"/"Given I
# am logged in as {string}" steps, and the compound "Given an MRF has been
# submitted..." setup steps already defined in mrf_to_delivery_steps.rb --
# Cucumber loads every step_definitions/*.rb file into the same World, so
# those are available here without redefining them.

# ---------------------------------------------------------------------------
# Canvassing
# ---------------------------------------------------------------------------

Given("another item {string} quantity {int} has also been approved under the same MRF") do |item, qty|
  MrfItem.create!(entry_date: Time.current, item: item, unit: "pcs", request_amount: qty,
                  project_code: @project, phase: "Civil", status: "Approved", approved_qty: qty,
                  mrf_code: @mrf_code, requester_email: @current_email)
end

Then("the pending quote MRFs should include {string}") do |item|
  api_post!("getPendingQuoteMRFs")
  match = @last_result["items"].find { |i| i["mrfId"] == @mrf_code && i["description"] == item }
  raise "expected #{item.inspect} to be in the pending quote MRFs, got #{@last_result['items'].inspect}" unless match
end

Then("the pending quote MRFs should not include {string}") do |item|
  api_post!("getPendingQuoteMRFs")
  match = @last_result["items"].find { |i| i["mrfId"] == @mrf_code && i["description"] == item }
  raise "expected #{item.inspect} to no longer be in the pending quote MRFs" if match
end

When("I fetch the canvas pivot data for the MRF") do
  api_post("getCanvasPivotData", @mrf_code)
end

Then("the canvas pivot should list suppliers {string} and {string}") do |s1, s2|
  suppliers = @last_result["suppliers"]
  unless suppliers.sort == [s1, s2].sort
    raise "expected suppliers #{[s1, s2].sort.inspect}, got #{suppliers.sort.inspect}"
  end
end

Then("the canvas pivot item {string} should have remaining cost {float}") do |item, expected|
  row = @last_result["items"].find { |i| i["desc"] == item }
  raise "no canvas pivot item found for #{item.inspect}" unless row
  actual = row["remainingCost"].to_f
  unless (actual - expected).abs < 0.01
    raise "expected remainingCost #{expected}, got #{actual}"
  end
end

Then("the canvas MRF list should show {string} as {word} for the MRF") do |field, expected_word|
  api_post!("getCanvasMRFList")
  row = @last_result.find { |r| r["mrfId"] == @mrf_code }
  raise "no canvas MRF list entry found for #{@mrf_code.inspect}" unless row
  expected = expected_word == "true"
  unless row[field] == expected
    raise "expected #{field} to be #{expected}, got #{row[field].inspect}"
  end
end

# ---------------------------------------------------------------------------
# Purchase order item assertions (back-calculated price/quantity)
# ---------------------------------------------------------------------------

# Distinct from mrf_to_delivery_steps.rb's "a purchase order should exist for
# {string} with status {string}", which checks the single cached @po_code
# (set for whichever item @item_name last pointed at) -- that doesn't work
# once one award call creates multiple POs for multiple suppliers, so this
# looks the PO up by supplier directly instead.
Then("a purchase order should exist for supplier {string} with status {string}") do |supplier, status|
  po = PurchaseOrderItem.find_by(supplier: supplier)
  raise "no PurchaseOrderItem found for supplier #{supplier.inspect}" unless po
  unless po.status == status
    raise "expected status #{status.inspect} for supplier #{supplier.inspect}, got #{po.status.inspect}"
  end
end

Then("the purchase order item {string} should have unit price {float}") do |item, expected|
  po = PurchaseOrderItem.find_by(item_name: item)
  raise "no PurchaseOrderItem found for #{item.inspect}" unless po
  actual = po.unit_price.to_f
  unless (actual - expected).abs < 0.01
    raise "expected unit price #{expected}, got #{actual}"
  end
end

Then("the purchase order item {string} should have quantity {float}") do |item, expected|
  po = PurchaseOrderItem.find_by(item_name: item)
  raise "no PurchaseOrderItem found for #{item.inspect}" unless po
  actual = po.quantity.to_f
  unless actual == expected
    raise "expected quantity #{expected}, got #{actual}"
  end
end

# ---------------------------------------------------------------------------
# Purchase order listing / payment status
# ---------------------------------------------------------------------------

Given("a payment of {int} has been issued against the purchase order") do |amount|
  IssuePayment.create!(mrf_code: @mrf_code, po_number: @po_code, term_description: "Progress",
                       percentage: "50%", supplier: "Holcim Depot", invoiced_amount: amount,
                       due_date: Date.current.to_s, bank: "BDO", check_number: "CHK-#{amount}",
                       payment_amount: amount, encoder_email: @current_email)
end

Then("the purchase order in getPurchaseOrders should show total {float}") do |expected|
  api_post!("getPurchaseOrders")
  row = @last_result.find { |p| p["poNumber"] == @po_code }
  raise "no PO row found for #{@po_code.inspect} in getPurchaseOrders" unless row
  actual = row["total"].to_f
  unless (actual - expected).abs < 0.01
    raise "expected total #{expected}, got #{actual}"
  end
end

Then("the purchase order in getPurchaseOrders should show payment status {string}") do |status|
  api_post!("getPurchaseOrders")
  row = @last_result.find { |p| p["poNumber"] == @po_code }
  raise "no PO row found for #{@po_code.inspect} in getPurchaseOrders" unless row
  unless row["paymentStatus"] == status
    raise "expected paymentStatus #{status.inspect}, got #{row['paymentStatus'].inspect}"
  end
end
