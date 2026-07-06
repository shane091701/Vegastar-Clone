class Api::RtbController < Api::BaseController
  # Port of getProjectEngineerData(projectCode) — code.js:558
  def get_project_engineer_data
    project_code = args[0].to_s.strip
    phases = BoqItem.where(project_code: project_code).where.not(phase: [nil, ""])
                    .distinct.pluck(:phase).map(&:strip).uniq.sort
    project = Project.find_by(code: project_code)
    render json: {
      phases: phases,
      customerName: project&.customer_name.to_s,
      quotedCost: project&.quoted_cost.to_f,
      company: project&.company.to_s
    }
  end

  # Port of submitProjectProgress(payload, userEmail) — code.js:598
  def submit_project_progress
    payload = arg(0) || {}
    ProjectProgress.create!(
      project_code: payload["projectCode"].to_s.strip,
      overall_percent: payload["overallPercent"].to_f,
      phase_breakdown: payload["phaseBreakdown"] || [],
      encoder_email: (args[1].presence || current_user.email).to_s
    )
    render json: "Success"
  end

  # Port of submitRTBRequest(payload, userEmail) — code.js:618
  def submit_rtb_request
    payload = arg(0) || {}
    project_code = payload["projectCode"].to_s.strip
    rtb_percent = payload["rtbPercent"].to_f
    raise "% to Bill must be between 1 and 100." if rtb_percent <= 0 || rtb_percent > 100

    project = Project.find_by(code: project_code)
    if project.nil? || project.quoted_cost.nil?
      raise "No Quoted Cost found for project #{project_code}. Please ensure it has been saved via BOQ upload."
    end
    quoted_cost = project.quoted_cost.to_f

    seq = RtbLog.where(project_code: project_code).count
    RtbLog.create!(
      rtb_code: "RTB-#{project_code}-#{(seq + 1).to_s.rjust(3, '0')}",
      project_code: project_code, percent_to_bill: rtb_percent,
      calculated_amount: (rtb_percent / 100) * quoted_cost,
      status: "Pending", encoder_email: (args[1].presence || current_user.email).to_s
    )
    render json: "Success"
  end

  # Port of getPendingRTBs() — code.js:706
  def get_pending_rtbs
    results = RtbLog.where(status: "Pending").order(:id).map do |rtb|
      project = Project.find_by(code: rtb.project_code)
      quoted_cost = project&.quoted_cost.to_f
      last_progress = ProjectProgress.where(project_code: rtb.project_code)
                                     .order(:id).last&.overall_percent.to_f
      {
        rtbId: rtb.rtb_code,
        projectCode: rtb.project_code,
        rtbPercent: rtb.percent_to_bill.to_f,
        encoder: rtb.encoder_email.to_s,
        date: rtb.created_at.strftime("%b %d, %Y"),
        quotedCost: quoted_cost,
        amountToBill: (rtb.percent_to_bill.to_f / 100) * quoted_cost,
        totalExpenses: ExpenseSummary.call(rtb.project_code)[:totalExpenses],
        lastProgress: last_progress
      }
    end
    render json: results
  rescue => e
    raise "Failed to fetch pending RTBs: #{e.message}"
  end

  # Port of processRTB(rtbId, action, userEmail) — code.js:773
  def process_rtb
    rtb = RtbLog.find_by(rtb_code: args[0].to_s.strip)
    raise "RTB not found: #{args[0]}" unless rtb
    raise "This RTB has already been processed." unless rtb.status.to_s.strip == "Pending"

    rtb.update!(status: args[1].to_s == "Approve" ? "Approved" : "Rejected",
                approver_email: current_user.email, action_date: Time.current)
    render json: "Success"
  end

  # Port of getApprovedRTBs() — code.js:801
  def get_approved_rtbs
    collected = Collection.pluck(:rtb_code).compact.map(&:strip).to_set
    results = RtbLog.where(status: "Approved").order(:id).filter_map do |rtb|
      rtb_id = rtb.rtb_code.to_s.strip
      next if collected.include?(rtb_id)
      quoted_cost = Project.find_by(code: rtb.project_code)&.quoted_cost.to_f
      {
        rtbId: rtb_id,
        projectCode: rtb.project_code,
        rtbPercent: rtb.percent_to_bill.to_f,
        quotedCost: quoted_cost,
        amountToBill: (rtb.percent_to_bill.to_f / 100) * quoted_cost
      }
    end
    render json: results
  rescue => e
    raise "Failed to fetch approved RTBs: #{e.message}"
  end

  # Port of submitCollection(payload, userEmail) — code.js:852
  def submit_collection
    payload = arg(0) || {}
    rtb_id = payload["rtbId"].to_s.strip
    unless RtbLog.exists?(rtb_code: rtb_id, status: "Approved")
      raise "Approved RTB not found: #{rtb_id}"
    end

    Collection.create!(
      rtb_code: rtb_id, project_code: payload["projectCode"],
      amount_collected: payload["amount"].to_f, bank: payload["bank"].to_s,
      due_date: payload["dueDate"].to_s, check_number: payload["checkNumber"].to_s,
      encoder_email: (args[1].presence || current_user.email).to_s
    )
    render json: "Success"
  end
end
