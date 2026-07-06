class Api::BoqBuilderController < Api::BaseController
  # Port of getBoqBuilderData() — code.js:4825
  def get_boq_builder_data
    phase_scope_map = Hash.new { |h, k| h[k] = Set.new }
    BoqItem.where.not(phase: [nil, ""]).pluck(:phase, :scope).each do |phase, scope|
      phase = phase.to_s.strip
      next if phase.blank?
      phase_scope_map[phase] << scope.to_s.strip if scope.to_s.strip.present?
      phase_scope_map[phase] # ensure key exists even without scopes
    end
    result = phase_scope_map.keys.sort.index_with { |ph| phase_scope_map[ph].to_a.sort }

    materials = Material.where.not(item_name: [nil, ""]).order(:id).map do |m|
      { name: m.item_name.strip, unit: m.unit.to_s.strip, quotedCost: m.quoted_cost.to_f }
    end
    render json: { phaseScopeMap: result, materialsList: materials }
  end

  # Port of submitNativeBoqForApproval(payload, userEmail) — code.js:4947
  def submit_native_boq_for_approval
    payload = arg(0)
    unless payload.is_a?(Hash) && payload["project"].is_a?(Hash) &&
           payload["items"].is_a?(Array) && payload["items"].any?
      raise "Invalid payload."
    end
    project_code = payload["project"]["code"].to_s.strip.gsub(/\s+/, " ")
    unless project_code.match?(/\A[A-Za-z0-9 ]+\z/)
      raise "Project Code may contain only letters, numbers, and spaces — no hyphens or symbols."
    end
    if BoqIngestor.project_code_exists?(project_code)
      raise "Project Code '#{project_code}' was already used. Please enter a unique code."
    end

    # Original suffix = sheet row count (header included), so count+1 here.
    sub_code = "BOQ-#{Date.current.strftime('%Y%m%d')}-#{(BoqSubmission.count + 1).to_s.rjust(3, '0')}"
    BoqSubmission.create!(submission_code: sub_code, project_code: project_code,
                          submitter_email: (args[1].presence || current_user.email).to_s,
                          status: "Pending", payload: payload)
    render json: { success: true, submissionId: sub_code }
  end

  # Port of getPendingBoqApprovals() — code.js:4985
  def get_pending_boq_approvals
    rows = BoqSubmission.where(status: "Pending").order(:id).map do |s|
      items = s.payload["items"] || []
      grand = items.sum do |it|
        it["totalCost"].to_f.nonzero? || (it["laborCost"].to_f + it["materialCost"].to_f) * it["qty"].to_f
      end
      project = s.payload["project"] || {}
      {
        submissionId: s.submission_code,
        projectCode: s.project_code,
        submitter: s.submitter_email,
        date: s.created_at.strftime("%b %d, %Y %H:%M"),
        customerName: project["customerName"].to_s,
        company: project["company"].to_s,
        itemCount: items.length,
        grandTotal: grand
      }
    end
    render json: rows.reverse
  end

  # Port of getBoqSubmissionPayload(submissionId) — code.js:5016
  def get_boq_submission_payload
    submission = find_submission!(args[0])
    render json: { submissionId: submission.submission_code, status: submission.status,
                   remarks: submission.admin_remarks.to_s, payload: submission.payload }
  end

  # Port of processBoqApproval(submissionId, action, remarks, userEmail) — code.js:5035
  def process_boq_approval
    submission = find_submission!(args[0])
    action = args[1].to_s
    remarks = args[2]
    raise "This submission has already been processed." unless submission.status == "Pending"

    case action
    when "Accept"
      code = (submission.payload.dig("project", "code") || "").strip.gsub(/\s+/, " ")
      raise "Cannot accept: Project Code already exists in the system." if BoqIngestor.project_code_exists?(code)
      ActiveRecord::Base.transaction do
        NativeBoqWriter.call(submission.payload)
        submission.update!(status: "Approved")
      end
      begin
        html = BoqPdfBuilder.approved_html(submission.submission_code, submission.payload)
        url = PdfGenerator.store(doc_type: "boq_approved", reference_code: submission.submission_code,
                                 html: html, file_name: "BOQ_#{submission.submission_code}.pdf")
        submission.update!(pdf_url: url)
      rescue => e
        Rails.logger.error("processBoqApproval PDF generation failed: #{e.message}")
      end
    when "Reject"
      submission.update!(status: "Rejected")
    when "Return"
      raise "Remarks are required when returning a BOQ." if remarks.to_s.strip.blank?
      submission.update!(status: "Returned", admin_remarks: remarks.to_s)
    else
      raise "Unknown action: #{action}"
    end

    submission.update!(action_by: current_user.email, action_date: Time.current)
    render json: "Success"
  end

  # Port of getMyBoqSubmissions(userEmail) — code.js:5102
  def get_my_boq_submissions
    target = (args[0].presence || current_user.email).to_s.strip.downcase
    rows = BoqSubmission.order(:id)
                        .select { |s| s.submitter_email.to_s.strip.downcase == target }
                        .map do |s|
      {
        submissionId: s.submission_code,
        projectCode: s.project_code,
        date: s.created_at.strftime("%b %d, %Y %H:%M"),
        status: s.status,
        remarks: s.admin_remarks.to_s,
        approvedPdfUrl: s.pdf_url.to_s
      }
    end
    render json: rows.reverse
  end

  # Port of markBoqSubmissionResubmitted(submissionId) — code.js:5126 (best-effort)
  def mark_boq_submission_resubmitted
    BoqSubmission.find_by(submission_code: args[0].to_s, status: "Returned")
                 &.update(status: "Resubmitted")
    render json: true
  end

  # Port of generateBoqApprovalPdf(submissionId) — code.js:5223
  def generate_boq_approval_pdf
    submission = find_submission!(args[0])
    html = BoqPdfBuilder.approval_html(submission.submission_code, submission.payload)
    url = PdfGenerator.store(doc_type: "boq_approval", reference_code: submission.submission_code,
                             html: html, file_name: "BOQ_Approval_#{submission.submission_code}.pdf")
    render json: url
  end

  private

  def find_submission!(submission_id)
    BoqSubmission.find_by(submission_code: submission_id.to_s.strip) ||
      raise("Submission not found: #{submission_id}")
  end
end
