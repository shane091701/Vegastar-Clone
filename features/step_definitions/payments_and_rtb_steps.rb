# Step definitions for features/payments_and_rtb.feature.
#
# Reuses api_post/api_post!, "the following users exist:", and
# "I am logged in as {string}" from mrf_to_delivery_steps.rb, plus the
# "an MRF has been submitted, approved, dispatched to ..." compound setup
# step also from mrf_to_delivery_steps.rb -- Cucumber loads every
# step_definitions/*.rb file into the same World, so these are available
# here without redefining them.

# ---------------------------------------------------------------------------
# Checks / Bulk Payments
# ---------------------------------------------------------------------------

When("I log bulk check payments:") do |table|
  submissions = table.hashes.map do |row|
    { "project" => row["project"], "date" => row["date"], "bank" => row["bank"],
      "checkNum" => row["checkNum"], "amount" => row["amount"].to_f }
  end
  api_post("logBulkPaymentData", submissions, @current_email)
end

Then("{int} Check records should exist for project {string}") do |count, project|
  actual = Check.where(project_name: project).count
  raise "expected #{count} Check records for #{project.inspect}, got #{actual}" unless actual == count
end

Then("a Check {string} should have amount {int} and status {string}") do |check_number, amount, status|
  check = Check.find_by(check_number: check_number)
  raise "no Check found with number #{check_number.inspect}" unless check
  unless check.amount.to_f == amount.to_f && check.status == status
    raise "expected amount=#{amount} status=#{status.inspect}, got amount=#{check.amount} status=#{check.status.inspect}"
  end
end

Given("a check {string} exists for project {string} amount {int}") do |check_number, project, amount|
  Check.create!(check_number: check_number, project_name: project, amount: amount,
               check_date: Date.current, status: "Not Deposited",
               encoded_by: @current_email, encode_date: Time.current)
end

When("I mark check {string} as {string}") do |check_number, status|
  check = Check.find_by!(check_number: check_number)
  api_post("updateCheckStatus", [check.id], status)
end

Then("check {string} should have status {string}") do |check_number, status|
  actual = Check.find_by!(check_number: check_number).status
  raise "expected status #{status.inspect}, got #{actual.inspect}" unless actual == status
end

Then("the pending checks list should not include {string}") do |check_number|
  api_post!("getPendingChecks")
  match = @last_result.find { |c| c["checkNumber"] == check_number }
  raise "expected #{check_number.inspect} to be absent from pending checks, but found it" if match
end

# ---------------------------------------------------------------------------
# Issue Payments / PO payment status
# ---------------------------------------------------------------------------

When("I save an issue payment of {int} for that purchase order term {string}") do |amount, term_desc|
  api_post("saveIssuePayments", {
    "payments" => [{
      "mrfId" => @mrf_code, "poCode" => @po_code, "termDesc" => term_desc,
      "percentage" => 50, "supplier" => "Holcim Depot", "invoicedAmt" => amount,
      "paymentDate" => "2026-08-01", "bank" => "BDO", "checkNumber" => "CHK-#{term_desc.hash.abs}",
      "paymentAmount" => amount
    }]
  }, @current_email)
end

Then("the purchase order's payment status should be {string}") do |status|
  api_post!("getPurchaseOrders")
  po = @last_result.find { |p| p["poNumber"] == @po_code }
  raise "no PO found for po_code=#{@po_code.inspect}" unless po
  unless po["paymentStatus"] == status
    raise "expected paymentStatus #{status.inspect}, got #{po['paymentStatus'].inspect}"
  end
end

# ---------------------------------------------------------------------------
# Project Progress
# ---------------------------------------------------------------------------

When("I submit project progress for {string} overall percent {int}") do |project_code, pct|
  api_post("submitProjectProgress", {
    "projectCode" => project_code, "overallPercent" => pct, "phaseBreakdown" => []
  }, @current_email)
end

Then("the latest project progress for {string} should be {int} percent") do |project_code, pct|
  progress = ProjectProgress.where(project_code: project_code).order(:id).last
  raise "no ProjectProgress found for #{project_code.inspect}" unless progress
  unless progress.overall_percent.to_f == pct.to_f
    raise "expected #{pct}%, got #{progress.overall_percent}%"
  end
end

# ---------------------------------------------------------------------------
# RTB / Collections
# ---------------------------------------------------------------------------

Given("a project {string} already exists with quoted cost {int}") do |code, quoted_cost|
  Project.create!(code: code, quoted_cost: quoted_cost)
end

def submit_rtb(project_code:, percent:)
  api_post("submitRTBRequest", { "projectCode" => project_code, "rtbPercent" => percent }, @current_email)
end

When("I submit an RTB request for project {string} percent to bill {int}") do |project_code, percent|
  submit_rtb(project_code: project_code, percent: percent)
end

Given("an RTB request has been submitted for project {string} percent to bill {int}") do |project_code, percent|
  submit_rtb(project_code: project_code, percent: percent)
  raise "setup: submitRTBRequest failed: #{@last_error}" if @last_error
  @rtb_id = RtbLog.where(project_code: project_code).order(:id).last.rtb_code
  @rtb_project = project_code
end

Then("the pending RTBs list should include project {string} with amount to bill {int}") do |project_code, amount|
  api_post!("getPendingRTBs")
  entry = @last_result.find { |r| r["projectCode"] == project_code }
  raise "no pending RTB found for project #{project_code.inspect}" unless entry
  unless entry["amountToBill"].to_f == amount.to_f
    raise "expected amountToBill #{amount}, got #{entry['amountToBill']}"
  end
end

Then("the pending RTBs list should not include project {string}") do |project_code|
  api_post!("getPendingRTBs")
  match = @last_result.find { |r| r["projectCode"] == project_code }
  raise "expected project #{project_code.inspect} to be absent from pending RTBs, but found it" if match
end

When("I approve that RTB") do
  api_post("processRTB", @rtb_id, "Approve", @current_email)
end

When("I reject that RTB") do
  api_post("processRTB", @rtb_id, "Reject", @current_email)
end

Then("that RTB's status should be {string}") do |status|
  actual = RtbLog.find_by!(rtb_code: @rtb_id).status
  raise "expected status #{status.inspect}, got #{actual.inspect}" unless actual == status
end

Then("the approved RTBs list should include project {string}") do |project_code|
  api_post!("getApprovedRTBs")
  match = @last_result.find { |r| r["projectCode"] == project_code }
  raise "expected project #{project_code.inspect} in approved RTBs, got #{@last_result.inspect}" unless match
end

Then("the approved RTBs list should not include project {string}") do |project_code|
  api_post!("getApprovedRTBs")
  match = @last_result.find { |r| r["projectCode"] == project_code }
  raise "expected project #{project_code.inspect} to be absent from approved RTBs, but found it" if match
end

When("I submit a collection for that RTB amount {int} bank {string} due date {string} check number {string}") do
  |amount, bank, due_date, check_number|
  api_post("submitCollection", {
    "rtbId" => @rtb_id, "projectCode" => @rtb_project, "amount" => amount,
    "bank" => bank, "dueDate" => due_date, "checkNumber" => check_number
  }, @current_email)
end
