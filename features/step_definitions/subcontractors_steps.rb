# Step definitions for features/subcontractors_and_work_packages.feature.
#
# Reuses api_post/api_post!, "the following users exist:", "I am logged in
# as {string}", and the generic "the request should succeed" / "the request
# should fail with an error matching {string}" steps already defined in
# mrf_to_delivery_steps.rb -- Cucumber loads every step_definitions/*.rb file
# into the same World, so those don't need redefining here.

# ---------------------------------------------------------------------------
# Subcontractor CRUD
# ---------------------------------------------------------------------------

Given("a subcontractor {string} is registered") do |name|
  api_post!("saveSubcontractor", { "name" => name, "tin" => "123", "contact" => "0917-000-0000" }, @current_email)
  @sub_id = @last_result["subId"]
end

When("I register a subcontractor named {string} TIN {string} contact {string}") do |name, tin, contact|
  api_post("saveSubcontractor", { "name" => name, "tin" => tin, "contact" => contact }, @current_email)
end

When("I toggle that subcontractor's active status") do
  api_post("toggleSubcontractorActive", @sub_id, @current_email)
end

Then("subcontractor {string} should exist and be active") do |name|
  sub = Subcontractor.find_by("LOWER(name) = ?", name.downcase)
  raise "no subcontractor named #{name.inspect}" unless sub
  raise "expected #{name.inspect} to be active" unless sub.active
  @sub_id ||= sub.sub_code
end

Then("subcontractor {string} should exist and be inactive") do |name|
  sub = Subcontractor.find_by("LOWER(name) = ?", name.downcase)
  raise "no subcontractor named #{name.inspect}" unless sub
  raise "expected #{name.inspect} to be inactive" if sub.active
end

# ---------------------------------------------------------------------------
# Work package creation (multi-step: start -> lines -> milestones -> submit)
# ---------------------------------------------------------------------------

def lines_from_table(table)
  table.hashes.map do |row|
    { "phase" => row["phase"], "scope" => row["scope"], "item" => row["item"],
      "costLabor" => row["laborCost"].to_f, "costMaterial" => row["materialCost"].to_f,
      "costTotal" => row["totalCost"].to_f }
  end
end

def milestones_from_table(table)
  table.hashes.map do |row|
    { "seq" => row["seq"].to_i, "label" => row["label"],
      "targetPct" => row["targetPct"].to_f, "paymentPct" => row["paymentPct"].to_f }
  end
end

When("I start a new work package for {string} on project {string} labeled {string} basis {string} contract value {int}") do
  |sub_name, project, label, basis, contract_value|
  sub = Subcontractor.find_by("LOWER(name) = ?", sub_name.downcase)
  raise "no subcontractor named #{sub_name.inspect} -- register it first" unless sub
  @wp_payload = {
    "project" => project, "subId" => sub.sub_code, "label" => label,
    "basis" => basis, "contractValue" => contract_value, "lines" => [], "milestones" => []
  }
end

When("with BOQ lines:") do |table|
  @wp_payload["lines"] = lines_from_table(table)
end

When("with milestones:") do |table|
  @wp_payload["milestones"] = milestones_from_table(table)
end

When("I submit the work package") do
  api_post("saveWorkPackage", @wp_payload, @current_email)
  @wp_code = @last_result["wpId"] if @last_result
end

# Standard two-milestone split (25%/40%, 100%/60%) used by every scenario
# that just needs *a* work package to exist, mirroring the proven shape in
# test/controllers/api/subcontractors_controller_test.rb's create_wp helper.
Given("a work package exists for {string} on project {string} contract value {int} with a single line {string} labor cost {int}") do
  |sub_name, project, contract_value, item_name, labor_cost|
  sub = Subcontractor.find_by("LOWER(name) = ?", sub_name.downcase)
  unless sub
    api_post!("saveSubcontractor", { "name" => sub_name, "tin" => "", "contact" => "" }, @current_email)
    sub = Subcontractor.find_by(sub_code: @last_result["subId"])
  end
  api_post!("saveWorkPackage", {
    "project" => project, "subId" => sub.sub_code, "label" => "#{item_name} Package",
    "basis" => "labor", "contractValue" => contract_value,
    "lines" => [{ "phase" => "Civil", "scope" => "1.1", "item" => item_name,
                  "costLabor" => labor_cost, "costMaterial" => 0, "costTotal" => labor_cost }],
    "milestones" => [
      { "seq" => 1, "label" => "Mobilization", "targetPct" => 25, "paymentPct" => 40 },
      { "seq" => 2, "label" => "Completion", "targetPct" => 100, "paymentPct" => 60 }
    ]
  }, @current_email)
  @wp_code = @last_result["wpId"]
end

Then("the work package should appear for project {string}") do |project|
  api_post!("getWorkPackagesForProject", project)
  match = @last_result.find { |wp| wp["wpId"] == @wp_code }
  raise "expected work package #{@wp_code.inspect} for project #{project.inspect}, got #{@last_result.inspect}" unless match
end

Then("BOQ line {string} for that work package should have an allocated cost of {int}") do |item, expected|
  line = WpBoqLine.find_by(wp_code: @wp_code, item: item)
  raise "no WpBoqLine #{item.inspect} for work package #{@wp_code.inspect}" unless line
  unless line.allocated_cost.to_f == expected.to_f
    raise "expected allocated cost #{expected}, got #{line.allocated_cost}"
  end
end

def milestone_for_seq(seq)
  SubconMilestone.where(wp_code: @wp_code).order(:seq).to_a[seq - 1]
end

Then("milestone {int} for that work package should have amount {int}") do |seq, expected|
  mil = milestone_for_seq(seq)
  raise "no milestone at seq #{seq} for work package #{@wp_code.inspect}" unless mil
  unless mil.amount.to_f == expected.to_f
    raise "expected milestone #{seq} amount #{expected}, got #{mil.amount}"
  end
end

# ---------------------------------------------------------------------------
# Progress reports and milestone status
# ---------------------------------------------------------------------------

When("I submit a progress report for that work package at {int} percent complete with narrative {string}") do
  |pct, narrative|
  project = WorkPackage.find_by(wp_code: @wp_code)&.project_code.to_s
  api_post("submitSubconReport", {
    "wpId" => @wp_code, "project" => project, "percentComplete" => pct, "narrative" => narrative
  }, @current_email)
end

Then("milestone {int} for that work package should be ready to pay") do |seq|
  mil = milestone_for_seq(seq)
  raise "no milestone at seq #{seq}" unless mil
  raise "expected milestone #{seq} to be ready to pay" unless mil.reload.ready_to_pay
end

Then("milestone {int} for that work package should not be ready to pay") do |seq|
  mil = milestone_for_seq(seq)
  raise "no milestone at seq #{seq}" unless mil
  raise "expected milestone #{seq} NOT to be ready to pay" if mil.reload.ready_to_pay
end

When("I manually mark milestone {int} for that work package as ready to pay") do |seq|
  mil = milestone_for_seq(seq)
  api_post("markMilestoneReady", mil.milestone_code, @current_email)
end

# ---------------------------------------------------------------------------
# Check linking / AP status
# ---------------------------------------------------------------------------

Given("a check {string} exists for project {string} bank {string} amount {int}") do
  |check_number, project_name, bank, amount|
  @check = Check.create!(check_date: Date.current, project_name: project_name, bank: bank,
                         check_number: check_number, amount: amount, status: "Not Deposited")
end

When("I link check {string} to milestone {int} for that work package") do |check_number, seq|
  mil = milestone_for_seq(seq)
  api_post("linkCheckToMilestone", mil.milestone_code, check_number, @current_email)
end

When("I unlink the check from milestone {int} for that work package") do |seq|
  mil = milestone_for_seq(seq)
  api_post("unlinkCheckFromMilestone", mil.milestone_code, @current_email)
end

When("that check is voided") do
  @check.update!(status: "Voided")
end

Then("the AP status for milestone {int} of that work package should be {string}") do |seq, expected_status|
  mil = milestone_for_seq(seq)
  api_post!("getSubconApData", {})
  row = @last_result["rows"].find { |r| r["milId"] == mil.milestone_code }
  raise "no AP row for milestone #{mil.milestone_code.inspect}" unless row
  unless row["status"] == expected_status
    raise "expected AP status #{expected_status.inspect}, got #{row['status'].inspect}"
  end
end

Then("the AP status for milestone {int} of that work package should be {string} noting {string}") do
  |seq, expected_status, note_snippet|
  mil = milestone_for_seq(seq)
  api_post!("getSubconApData", {})
  row = @last_result["rows"].find { |r| r["milId"] == mil.milestone_code }
  raise "no AP row for milestone #{mil.milestone_code.inspect}" unless row
  unless row["status"] == expected_status
    raise "expected AP status #{expected_status.inspect}, got #{row['status'].inspect}"
  end
  unless row["statusNote"].to_s.include?(note_snippet)
    raise "expected status note to mention #{note_snippet.inspect}, got #{row['statusNote'].inspect}"
  end
end

Then("milestone {int} for that work package should have no check linked") do |seq|
  mil = milestone_for_seq(seq)
  raise "expected no check linked" unless mil.reload.check_number.to_s.strip.empty?
end

# ---------------------------------------------------------------------------
# Budget vs actual / payables
# ---------------------------------------------------------------------------

Then("the payables list should include milestone {int} of that work package") do |seq|
  mil = milestone_for_seq(seq)
  api_post!("getSubconPayables")
  match = @last_result.find { |p| p["milId"] == mil.milestone_code }
  raise "expected milestone #{mil.milestone_code.inspect} in payables, got #{@last_result.inspect}" unless match
end

Then("the budget view for project {string} should show BOQ budget {int}, contract value {int}, and variance {int}") do
  |project, boq_budget, contract_value, variance|
  api_post!("getSubconBudgetData", "")
  row = @last_result["rows"].find { |r| r["project"] == project }
  raise "no budget row for project #{project.inspect}" unless row
  ok = row["boqBudget"].to_f == boq_budget.to_f &&
       row["contractValue"].to_f == contract_value.to_f &&
       row["variance"].to_f == variance.to_f
  unless ok
    raise "expected boqBudget=#{boq_budget} contractValue=#{contract_value} variance=#{variance}, got #{row.inspect}"
  end
end
