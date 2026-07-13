# Step definitions for features/build_boq_approval.feature.
#
# Reuses api_post/api_post!, "the following users exist:", "I am logged in
# as {string}", "the request should succeed", "the request should fail with
# an error matching {string}", "a project {string} already exists",
# "project {string} should exist", and "a BOQ item {string} should exist for
# project {string}" -- all already defined in mrf_to_delivery_steps.rb /
# system_wide_steps.rb (Cucumber loads every step_definitions/*.rb file into
# the same World).

def build_native_boq_payload(project_code, customer_name, company, item_rows)
  items = item_rows.map do |row|
    {
      "phase" => row["phase"], "scope" => row["scope"], "name" => row["name"],
      "unit" => row["unit"], "qty" => row["qty"].to_f,
      "laborCost" => row["laborCost"].to_f, "materialCost" => row["materialCost"].to_f,
      "totalCost" => 0, "quotedCost" => 0
    }
  end
  {
    "project" => { "code" => project_code, "customerName" => customer_name, "company" => company,
                   "quotedCost" => "0", "milestoneTerms" => [] },
    "items" => items
  }
end

When("I submit a native BOQ for approval for project {string} customer {string} company {string} with items:") do
  |project_code, customer_name, company, table|
  payload = build_native_boq_payload(project_code, customer_name, company, table.hashes)
  api_post("submitNativeBoqForApproval", payload, @current_email)
  @submission_id = @last_result["submissionId"] if @last_result.is_a?(Hash)
  @submission_project = project_code
end

Then("that BOQ submission should appear in pending approvals for project {string}") do |project_code|
  api_post!("getPendingBoqApprovals")
  match = @last_result.find { |r| r["projectCode"] == project_code }
  raise "expected a pending approval for project #{project_code.inspect}, got #{@last_result.inspect}" unless match
end

Then("the pending approval grand total for project {string} should be {float}") do |project_code, expected_total|
  api_post!("getPendingBoqApprovals")
  match = @last_result.find { |r| r["projectCode"] == project_code }
  raise "no pending approval found for project #{project_code.inspect}" unless match
  actual = match["grandTotal"]
  raise "expected grandTotal to be Numeric, got #{actual.class}: #{actual.inspect}" unless actual.is_a?(Numeric)
  unless (actual - expected_total).abs < 0.01
    raise "expected grand total #{expected_total}, got #{actual}"
  end
end

Given("a native BOQ has been submitted for project {string}") do |project_code|
  payload = build_native_boq_payload(project_code, "Juan Dela Cruz", "Vegastar", [
    { "phase" => "Civil", "scope" => "Foundation", "name" => "Concrete", "unit" => "cu.m",
      "qty" => "10", "laborCost" => "100", "materialCost" => "400" }
  ])
  api_post!("submitNativeBoqForApproval", payload, @current_email)
  @submission_id = @last_result["submissionId"]
  @submission_project = project_code
end

When("I approve that BOQ submission") do
  PdfGenerator.stub(:store, "/pdf/boq_approved_stub.pdf") do
    api_post("processBoqApproval", @submission_id, "Accept", "")
  end
end

When("I reject that BOQ submission") do
  api_post("processBoqApproval", @submission_id, "Reject", "")
end

When("I return that BOQ submission with remarks {string}") do |remarks|
  api_post("processBoqApproval", @submission_id, "Return", remarks)
end

When("I return that BOQ submission with no remarks") do
  api_post("processBoqApproval", @submission_id, "Return", "")
end

When("I mark that BOQ submission as resubmitted") do
  api_post("markBoqSubmissionResubmitted", @submission_id)
end

Then("that BOQ submission should have status {string} for submitter {string}") do |status, submitter_email|
  api_post!("getMyBoqSubmissions", submitter_email)
  match = @last_result.find { |r| r["submissionId"] == @submission_id }
  raise "no submission #{@submission_id.inspect} found for submitter #{submitter_email.inspect}" unless match
  unless match["status"] == status
    raise "expected status #{status.inspect}, got #{match['status'].inspect}"
  end
end

Then("that BOQ submission's remarks should be {string}") do |remarks|
  api_post!("getMyBoqSubmissions", @current_email)
  match = @last_result.find { |r| r["submissionId"] == @submission_id }
  raise "no submission #{@submission_id.inspect} found" unless match
  unless match["remarks"] == remarks
    raise "expected remarks #{remarks.inspect}, got #{match['remarks'].inspect}"
  end
end

Then("that BOQ submission should no longer appear in pending approvals") do
  api_post!("getPendingBoqApprovals")
  match = @last_result.find { |r| r["submissionId"] == @submission_id }
  raise "expected submission #{@submission_id.inspect} to no longer be pending, but found it: #{match.inspect}" if match
end
