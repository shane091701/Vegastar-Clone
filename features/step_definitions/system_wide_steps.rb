# Step definitions for boq_upload_and_adjustments.feature,
# manage_data_and_audit_trail.feature, and petty_cash.feature.
#
# Reuses the generic api_post/api_post! helpers and the "the following users
# exist:" / "I am logged in as {string}" steps already defined in
# mrf_to_delivery_steps.rb -- Cucumber loads every step_definitions/*.rb file
# into the same World, so those are available here without redefining them.

# ---------------------------------------------------------------------------
# BOQ Upload
# ---------------------------------------------------------------------------

def build_boq_csv(item_rows)
  lines = ["ITEM,DESCRIPTION,QTY,UNIT,U/C MAT,TOTAL MAT,U/C LABOR,TOTAL LABOR,TOTAL"]
  last_phase = nil
  item_rows.each do |it|
    if it["phase"] != last_phase
      lines << "#{it['phase']},,,,,,,,"
      last_phase = it["phase"]
    end
    lines << ",#{it['item']},#{it['qty']},#{it['unit']},,,,,"
  end
  lines.join("\n") + "\n"
end

When("I upload a BOQ workbook for project {string} with items:") do |project_code, table|
  csv = build_boq_csv(table.hashes)
  api_post("processBOQ", Base64.strict_encode64(csv), "boq.csv", project_code, {})
end

When("I upload a broken \\(unparseable\\) BOQ workbook for project {string}") do |project_code|
  api_post("processBOQ", Base64.strict_encode64("not a real workbook"), "f.xlsx", project_code, {})
end

When("I upload an empty BOQ workbook \\(header only, no items\\) for project {string}") do |project_code|
  csv = "ITEM,DESCRIPTION,QTY,UNIT\n"
  api_post("processBOQ", Base64.strict_encode64(csv), "empty.csv", project_code, {})
end

Then("the upload result should mention {string}") do |snippet|
  # processBOQ never raises an HTTP-level error -- BoqIngestor.call always
  # returns 200 with a plain string that's either a success message or an
  # "Error: ..."-prefixed one (see boq_ingestor_test.rb for the same
  # convention), so check the string body itself, not @last_error/HTTP status.
  unless @last_result.to_s.include?(snippet)
    raise "expected the upload result to mention #{snippet.inspect}, got #{@last_result.inspect}"
  end
end

Given("a project {string} already exists") do |code|
  Project.create!(code: code)
end

Given("a project {string} already exists with a BOQ item {string} material cost {int} labor cost {int}") do
  |code, item, mat, lab|
  Project.create!(code: code)
  @boq_item = BoqItem.create!(project_code: code, item: item, phase: "General", uom: "bags", qty: 10,
                              total_material: mat, labor_cost_k: lab)
end

Then("project {string} should exist") do |code|
  raise "expected project #{code.inspect} to exist" unless Project.exists?(code: code)
end

Then("project {string} should not exist") do |code|
  raise "expected project #{code.inspect} NOT to exist, but it does" if Project.exists?(code: code)
end

Then("a BOQ item {string} should exist for project {string}") do |item, project_code|
  raise "expected a BoqItem #{item.inspect} for project #{project_code.inspect}" unless
    BoqItem.exists?(project_code: project_code, item: item)
end

When("I add a BOQ item to project {string} phase {string} named {string} quantity {int} unit {string} material cost {int} labor cost {int} reason {string}") do
  |project_code, phase, item, qty, unit, mat, lab, reason|
  api_post("addBoqItem", {
    "project" => project_code, "phase" => phase, "item" => item, "qty" => qty,
    "unit" => unit, "matCost" => mat, "labCost" => lab, "reason" => reason
  })
end

When("I adjust that BOQ item to material cost {int} labor cost {int} reason {string}") do |mat, lab, reason|
  api_post("adjustBoqItem", {
    "rowIdx" => @boq_item.id, "newMat" => mat, "newLab" => lab, "reason" => reason
  })
end

Then("the BOQ item {string} for project {string} should have material cost {int} and labor cost {int}") do
  |item, project_code, mat, lab|
  row = BoqItem.find_by(project_code: project_code, item: item)
  raise "no BoqItem #{item.inspect} found for project #{project_code.inspect}" unless row
  unless row.total_material.to_f == mat.to_f && row.labor_cost_k.to_f == lab.to_f
    raise "expected material=#{mat}, labor=#{lab}, got material=#{row.total_material}, labor=#{row.labor_cost_k}"
  end
end

# ---------------------------------------------------------------------------
# Manage Data + audit trail
# ---------------------------------------------------------------------------

Given("a supplier {string} exists") do |name|
  @supplier = Supplier.create!(company_name: name, email: "#{name.parameterize}@test.local")
end

When("I edit supplier {string} setting company name to {string}") do |_current_name, new_name|
  api_post("updateManagedRow", "suppliers", @supplier.id, { "company_name" => new_name })
end

When("I delete that supplier") do
  api_post("deleteManagedRow", "suppliers", @supplier.id)
end

Then("supplier {string} should exist") do |name|
  raise "expected supplier #{name.inspect} to exist" unless Supplier.exists?(company_name: name)
end

Then("supplier {string} should not exist") do |name|
  raise "expected supplier #{name.inspect} NOT to exist" if Supplier.exists?(company_name: name)
end

When("I try to delete project {string} from Manage Data") do |code|
  project = Project.find_by!(code: code)
  api_post("deleteManagedRow", "projects", project.id)
end

Given("a delivery record exists for PO {string} item {string} quantity {int}") do |po, item, qty|
  @delivery = Delivery.create!(po_number: po, item_name: item, quantity: qty, received_date: Time.current)
end

When("I correct that delivery's quantity to {int}") do |qty|
  api_post("updateManagedRow", "deliveries", @delivery.id, {
    "po_number" => @delivery.po_number, "item_name" => @delivery.item_name, "quantity" => qty
  })
end

Then("that delivery's quantity should be {int}") do |qty|
  actual = @delivery.reload.quantity.to_f
  raise "expected quantity #{qty}, got #{actual}" unless actual == qty.to_f
end

When("I delete that delivery record") do
  api_post("deleteManagedRow", "deliveries", @delivery.id)
end

Then("that delivery record should no longer exist") do
  raise "expected delivery to be deleted" if Delivery.exists?(@delivery.id)
end

Given("a reimbursement record exists for project {string} amount {int}") do |project_code, amount|
  @reimbursement = Reimbursement.create!(project_code: project_code, expense_type: "Fuel",
                                        particulars: "Gasoline", amount: amount)
end

When("I correct that reimbursement's amount to {int}") do |amount|
  api_post("updateManagedRow", "reimbursements", @reimbursement.id, {
    "project_code" => @reimbursement.project_code, "amount" => amount
  })
end

Then("that reimbursement's amount should be {int}") do |amount|
  actual = @reimbursement.reload.amount.to_f
  raise "expected amount #{amount}, got #{actual}" unless actual == amount.to_f
end

When("I delete that reimbursement record") do
  api_post("deleteManagedRow", "reimbursements", @reimbursement.id)
end

Then("that reimbursement record should no longer exist") do
  raise "expected reimbursement to be deleted" if Reimbursement.exists?(@reimbursement.id)
end

Then("the {string} history should show a(n) {string} entry for {string}") do |type, action, label|
  api_post!("getManagedRowHistory", type)
  match = @last_result.find { |e| e["action"] == action && e["label"] == label }
  raise "expected a #{action.inspect} history entry for #{label.inspect} in #{type.inspect}, got #{@last_result.inspect}" unless match
end

Then("the {string} history should show exactly {int} entry") do |type, count|
  api_post!("getManagedRowHistory", type)
  unless @last_result.length == count
    raise "expected #{count} history entries for #{type.inspect}, got #{@last_result.length}: #{@last_result.inspect}"
  end
end

# ---------------------------------------------------------------------------
# Petty Cash
# ---------------------------------------------------------------------------

When("I submit a petty cash record for project {string} type {string} particulars {string} amount {int} with a receipt photo") do
  |project_code, expense_type, particulars, amount|
  file = { "name" => "receipt.png", "mimeType" => "image/png", "data" => Base64.strict_encode64("fakepngdata") }
  api_post("submitPettyCashRecord", {
    "project" => project_code, "expenseType" => expense_type,
    "particulars" => particulars, "amount" => amount, "file" => file
  }, @current_email)
end

When("I submit a petty cash record for project {string} type {string} particulars {string} amount {int} with no receipt photo") do
  |project_code, expense_type, particulars, amount|
  api_post("submitPettyCashRecord", {
    "project" => project_code, "expenseType" => expense_type,
    "particulars" => particulars, "amount" => amount, "file" => {}
  }, @current_email)
end

Then("the petty cash ledger for project {string} should include a {string} entry for {string} amount {int}") do
  |project_code, expense_type, particulars, amount|
  api_post!("getPCLedgerData")
  match = @last_result["records"].find do |r|
    r["project"] == project_code && r["type"] == expense_type &&
      r["particulars"] == particulars && r["amount"].to_f == amount.to_f
  end
  raise "expected a ledger entry matching project=#{project_code} type=#{expense_type} particulars=#{particulars} amount=#{amount}, got #{@last_result['records'].inspect}" unless match
end
