class Api::SubcontractorsController < Api::BaseController
  # Port of getSubcontractors() — code.js:5464
  def get_subcontractors
    render json: Subcontractor.order(:id).map { |s|
      { subId: s.sub_code, name: s.name.to_s.strip, tin: s.tin.to_s.strip,
        contact: s.contact.to_s.strip, active: s.active }
    }
  end

  # Port of saveSubcontractor(payload, userEmail) — code.js:5479
  def save_subcontractor
    payload = arg(0) || {}
    name = payload["name"].to_s.strip
    raise "Subcontractor name is required." if name.blank?
    if Subcontractor.where("LOWER(TRIM(name)) = ?", name.downcase).exists?
      raise "A subcontractor named \"#{name}\" already exists."
    end

    sub = nil
    ActiveRecord::Base.transaction do
      sub = Subcontractor.create!(sub_code: SequencedCode.next_sub_code, name: name,
                                  tin: payload["tin"].to_s, contact: payload["contact"].to_s,
                                  active: true, created_by: current_user.email)
      SubconAudit.log!("Subcontractor", sub.sub_code, "create", "Created: #{name}", current_user.email)
    end
    render json: { subId: sub.sub_code, name: name }
  end

  # Port of toggleSubcontractorActive(subId, userEmail) — code.js:5506
  def toggle_subcontractor_active
    sub = Subcontractor.find_by(sub_code: args[0].to_s.strip)
    raise "Subcontractor not found: #{args[0]}" unless sub

    new_active = !sub.active
    ActiveRecord::Base.transaction do
      sub.update!(active: new_active)
      SubconAudit.log!("Subcontractor", sub.sub_code, new_active ? "reactivate" : "retire",
                       "#{new_active ? 'Reactivated' : 'Retired'}: #{sub.name}", current_user.email)
    end
    render json: { subId: sub.sub_code, active: new_active }
  end

  # Port of getBoqLinesForAssignment(project) — code.js:5552. NOTE: reproduces
  # the original's column quirk — item comes from Logs Col E (unit labor slot)
  # and scope from Col B (item slot).
  def get_boq_lines_for_assignment
    project = args[0].to_s
    lines = []
    BoqItem.where(project_code: project).order(:id).each do |b|
      item = b.unit_labor_cost.to_s.strip
      item = format("%g", b.unit_labor_cost.to_f) if b.unit_labor_cost.present?
      next if b.unit_labor_cost.blank?
      phase = b.phase.to_s.strip
      scope = b.item.to_s.strip
      lines << {
        key: "#{project}|#{phase}|#{scope}|#{item}",
        phase: phase, scope: scope, item: item,
        costLabor: b.total_labor.to_f,
        costMaterial: b.total_material.to_f,
        costTotal: b.total_cost.to_f
      }
    end

    live_wps = {}
    WorkPackage.order(:id).each do |wp|
      live_wps[wp.wp_code] = wp.subcontractor_name.to_s unless wp.status.to_s.downcase == "voided"
    end

    claimed = {}
    WpBoqLine.order(:id).each do |l|
      sub_name = live_wps[l.wp_code.to_s]
      next unless sub_name
      claimed["#{l.project_code}|#{l.phase}|#{l.scope}|#{l.item}"] = sub_name
    end

    render json: { lines: lines, claimed: claimed }
  end

  # Port of saveWorkPackage(payload, userEmail) — code.js:5602
  def save_work_package
    render json: WorkPackageCreator.call(arg(0) || {}, current_user.email)
  end

  # Port of getWorkPackagesForProject(project) — code.js:5803
  def get_work_packages_for_project
    project = args[0].to_s
    rows = WorkPackage.where(project_code: project).order(:id)
                      .reject { |wp| wp.status.to_s.downcase == "voided" }
                      .map { |wp| { wpId: wp.wp_code, label: wp.label.to_s } }
    render json: rows
  end

  # Port of getMilestonesForWp(wpId) — code.js:5814
  def get_milestones_for_wp
    rows = SubconMilestone.where(wp_code: args[0].to_s).order(:seq, :id)
                          .map { |m| { milId: m.milestone_code, seq: m.seq.to_i, label: m.label.to_s } }
    render json: rows
  end

  # Port of getWpMilestonesForAp(wpId) — code.js:5825
  def get_wp_milestones_for_ap
    rows = SubconMilestone.where(wp_code: args[0].to_s).order(:seq, :id).map do |m|
      { milId: m.milestone_code, seq: m.seq.to_i, label: m.label.to_s,
        targetPct: m.target_pct.to_f, paymentPct: m.payment_pct.to_f,
        amount: m.amount.to_f, readyToPay: m.ready_to_pay,
        checkId: m.check_number.to_s.strip, status: m.status.to_s }
    end
    render json: rows
  end

  # Port of getSubconReportsData(userEmail, isAdmin) — code.js:5749
  def get_subcon_reports_data
    user_email = (args[0].presence || current_user.email).to_s
    is_admin = !!args[1]

    wp_map = {}
    projects = Set.new
    WorkPackage.order(:id).each do |wp|
      wp_map[wp.wp_code] = { label: wp.label.to_s, subName: wp.subcontractor_name.to_s }
      projects << wp.project_code.to_s
    end

    reports = SubconReport.order(:id).to_a
    unless is_admin
      reports = reports.select { |r| r.reported_by.to_s.strip.downcase == user_email.downcase }
    end

    rows = reports.sort_by { |r| -r.created_at.to_i }.map do |r|
      wp = wp_map[r.wp_code.to_s] || { label: r.wp_code.to_s, subName: "" }
      {
        reportId: r.report_code, wpId: r.wp_code, wpLabel: wp[:label],
        project: r.project_code.to_s, paymentTerm: r.payment_term.to_s,
        percent: r.percent_complete.to_f, photosUrl: r.photos_url.to_s,
        reportedBy: r.reported_by.to_s, reportedByName: r.reported_by_name.to_s,
        date: r.created_at.strftime("%b %-d, %Y")
      }
    end
    render json: { projects: projects.to_a.sort, reports: rows }
  end

  # Port of submitSubconReport(payload, userEmail) — code.js:5846
  def submit_subcon_report
    payload = arg(0) || {}
    user_email = (args[1].presence || current_user.email).to_s
    raise "Work Package is required." if payload["wpId"].blank?
    raise "Narrative is required." if payload["narrative"].to_s.strip.blank?
    pct = payload["percentComplete"].to_f
    raise "Percent Complete must be between 0 and 100." if pct < 0 || pct > 100

    reporter_name = User.find_by(email: user_email.downcase)&.name.presence || user_email.split("@").first

    wp = WorkPackage.find_by(wp_code: payload["wpId"].to_s)
    context = {
      subName: wp&.subcontractor_name.to_s,
      wpLabel: wp&.label.presence || payload["wpId"].to_s,
      project: wp&.project_code.presence || payload["project"].to_s
    }

    report = nil
    flagged = nil
    ActiveRecord::Base.transaction do
      report = SubconReport.create!(
        report_code: SequencedCode.next_report_code,
        wp_code: payload["wpId"], project_code: payload["project"].to_s,
        payment_term: payload["paymentTerm"].to_s, percent_complete: pct,
        narrative: payload["narrative"].to_s.strip,
        reported_by: user_email, reported_by_name: reporter_name
      )
      SubconAudit.log!("Report", report.report_code, "create report",
                       "WP: #{payload['wpId']} | #{pct}% complete", user_email)
      flagged = MilestoneAutoFlagger.call(wp_code: payload["wpId"].to_s,
                                          percent_complete: pct,
                                          report_code: report.report_code)
    end

    if (payload["photos"] || []).any?
      begin
        urls = payload["photos"].map do |ph|
          report.photos.attach(io: StringIO.new(Base64.decode64(ph["data"].to_s)),
                               filename: "#{report.report_code}_#{ph['name']}",
                               content_type: ph["mimeType"].to_s)
          Rails.application.routes.url_helpers.rails_blob_path(
            report.reload.photos.last, disposition: "inline", only_path: true
          )
        end
        report.update!(photos_url: urls.join(", "))
      rescue => e
        Rails.logger.error("submitSubconReport photos: #{e.message}")
      end
    end

    if flagged[:flaggedMilIds].any?
      begin
        recipients = subcon_notif_recipients
        if recipients.any?
          SubconMailer.ready_to_pay(recipients, flagged[:flaggedDetails],
                                    context.merge(reporterName: reporter_name,
                                                  percentComplete: pct,
                                                  reportId: report.report_code)).deliver_now
        end
      rescue => e
        Rails.logger.error("submitSubconReport email: #{e.message}")
      end
    end

    render json: { reportId: report.report_code, flagged: flagged[:flaggedMilIds] }
  end

  # Port of markMilestoneReady(milId, userEmail) — code.js:6072
  def mark_milestone_ready
    mil = SubconMilestone.find_by(milestone_code: args[0].to_s)
    raise "Milestone not found: #{args[0]}" unless mil
    raise "Milestone #{mil.milestone_code} is already marked Ready to Pay." if mil.ready_to_pay
    raise "Milestone #{mil.milestone_code} already has a check assigned." if mil.check_number.to_s.strip.present?

    ActiveRecord::Base.transaction do
      mil.update!(ready_to_pay: true)
      SubconAudit.log!("Milestone", mil.milestone_code, "manual-flag",
                       "Manually marked Ready to Pay", current_user.email)
    end

    begin
      wp = WorkPackage.find_by(wp_code: mil.wp_code)
      recipients = subcon_notif_recipients
      if recipients.any?
        SubconMailer.ready_to_pay(recipients,
          [{ milId: mil.milestone_code, seq: mil.seq, label: mil.label.to_s, amount: mil.amount.to_f }],
          { subName: wp&.subcontractor_name.to_s, wpLabel: wp&.label.presence || mil.wp_code,
            project: wp&.project_code.to_s, reporterName: current_user.email,
            percentComplete: "Manual override", reportId: "MANUAL" }).deliver_now
      end
    rescue => e
      Rails.logger.error("markMilestoneReady email: #{e.message}")
    end

    render json: { milId: mil.milestone_code, readyToPay: true }
  end

  # Port of getLinkableChecksForSub(subId) — code.js:6176
  def get_linkable_checks_for_sub
    sub = Subcontractor.find_by(sub_code: args[0].to_s.strip)
    sub_first = sub&.name.to_s.strip.split(/\s+/).first.to_s.downcase

    linked_ids = SubconMilestone.where.not(check_number: [nil, ""])
                                .pluck(:check_number).map(&:strip).to_set

    eligible = Check.order(:id).filter_map do |c|
      check_num = c.check_number.to_s.strip
      next unless check_num.present? && !check_num.include?("@") && check_num.match?(/[A-Za-z0-9]/)
      amount = c.amount.to_f
      next unless amount.positive?
      next if c.status.to_s.strip.downcase == "voided"
      next if linked_ids.include?(check_num)
      {
        checkNumber: check_num,
        project: c.project_name.to_s.strip,
        bank: c.bank.to_s.strip,
        amount: amount,
        amountFmt: "₱" + ActiveSupport::NumberHelper.number_to_delimited(format("%.2f", amount)),
        date: c.check_date&.strftime("%b %-d, %Y").to_s,
        status: c.status.to_s.strip
      }
    end

    if sub_first.present? && sub_first.length > 2
      matched = eligible.select { |r| r[:project].downcase.include?(sub_first) }
      return render json: matched if matched.any?
    end
    render json: eligible
  end

  # Port of linkCheckToMilestone(milId, checkId, userEmail) — code.js:6276
  def link_check_to_milestone
    mil = SubconMilestone.find_by(milestone_code: args[0].to_s)
    raise "Milestone not found: #{args[0]}" unless mil
    check_id = args[1].to_s

    was_ready = mil.ready_to_pay
    ActiveRecord::Base.transaction do
      mil.update!(check_number: check_id, ready_to_pay: false)
      SubconAudit.log!("Milestone", mil.milestone_code, "link_check",
                       "Linked check ##{check_id}", current_user.email)
      if was_ready
        SubconAudit.log!("Milestone", mil.milestone_code, "clear_ready",
                         "Ready To Pay cleared on check link", current_user.email)
      end
    end
    render json: { milId: mil.milestone_code, checkId: check_id }
  end

  # Port of unlinkCheckFromMilestone(milId, userEmail) — code.js:6312
  def unlink_check_from_milestone
    mil = SubconMilestone.find_by(milestone_code: args[0].to_s)
    raise "Milestone not found: #{args[0]}" unless mil

    prev = mil.check_number.to_s.strip
    ActiveRecord::Base.transaction do
      mil.update!(check_number: "")
      SubconAudit.log!("Milestone", mil.milestone_code, "unlink_check",
                       "Unlinked check ##{prev} (Ready To Pay NOT restored)", current_user.email)
    end
    render json: { milId: mil.milestone_code }
  end

  # Port of getSubconApData(filters) — code.js:6340
  def get_subcon_ap_data
    filters = arg(0) || {}
    checks_map = SubconStatus.checks_map

    wp_map = {}
    WorkPackage.order(:id).each do |wp|
      wp_map[wp.wp_code] = { subId: wp.sub_code.to_s, subName: wp.subcontractor_name.to_s,
                             project: wp.project_code.to_s, label: wp.label.to_s,
                             wpStatus: wp.status.to_s }
    end

    subs = Subcontractor.order(:id).map { |s| { subId: s.sub_code, name: s.name.to_s } }
    projects = wp_map.values.map { |w| w[:project] }.uniq.sort

    f_sub = filters["subId"].to_s
    f_project = filters["project"].to_s
    f_statuses = filters["statuses"].presence

    kpi = { open: { count: 0, sum: 0.0 }, ready: { count: 0, sum: 0.0 },
            paid: { count: 0, sum: 0.0 }, voided: 0 }
    rows = []

    SubconMilestone.order(:id).each do |mil|
      wp = wp_map[mil.wp_code.to_s]
      next unless wp

      derived = if wp[:wpStatus].downcase == "voided"
        { status: "Voided", note: "" }
      else
        SubconStatus.milestone_status(mil, checks_map)
      end
      amount = mil.amount.to_f

      case derived[:status]
      when "Open" then kpi[:open][:count] += 1; kpi[:open][:sum] += amount
      when "Ready to Pay" then kpi[:ready][:count] += 1; kpi[:ready][:sum] += amount
      when "Paid" then kpi[:paid][:count] += 1; kpi[:paid][:sum] += amount
      when "Voided" then kpi[:voided] += 1
      end

      next if f_sub.present? && wp[:subId] != f_sub
      next if f_project.present? && wp[:project] != f_project
      next if f_statuses && !f_statuses.include?(derived[:status])

      rows << {
        milId: mil.milestone_code, wpId: mil.wp_code, wpLabel: wp[:label],
        subId: wp[:subId], subName: wp[:subName], project: wp[:project],
        seq: mil.seq.to_i, label: mil.label.to_s,
        targetPct: mil.target_pct.to_f, paymentPct: mil.payment_pct.to_f,
        amount: amount, readyToPay: mil.ready_to_pay,
        checkId: mil.check_number.to_s.strip,
        status: derived[:status], statusNote: derived[:note]
      }
    end

    render json: { rows: rows, kpi: kpi, subs: subs, projects: projects }
  end

  # Port of getSubconBudgetData(projectFilter) — code.js:6421
  def get_subcon_budget_data
    project_filter = args[0].to_s.strip
    checks_map = SubconStatus.checks_map

    wps = WorkPackage.order(:id).to_a
    projects = wps.map { |w| w.project_code.to_s }.uniq.sort

    boq_by_wp = Hash.new(0.0)
    WpBoqLine.find_each { |l| boq_by_wp[l.wp_code.to_s] += l.boq_cost.to_f }

    paid_by_wp = Hash.new(0.0)
    SubconMilestone.find_each do |mil|
      derived = SubconStatus.milestone_status(mil, checks_map)
      paid_by_wp[mil.wp_code.to_s] += mil.amount.to_f if derived[:status] == "Paid"
    end

    kpi_boq = kpi_contract = kpi_paid = 0.0
    rows = wps.select { |w| project_filter.blank? || w.project_code.to_s.strip == project_filter }
              .map do |wp|
      boq_budget = boq_by_wp[wp.wp_code]
      contract_value = wp.contract_value.to_f
      paid = paid_by_wp[wp.wp_code]
      kpi_boq += boq_budget
      kpi_contract += contract_value
      kpi_paid += paid
      { wpId: wp.wp_code, label: wp.label.to_s, project: wp.project_code.to_s,
        subName: wp.subcontractor_name.to_s, basis: wp.budget_basis.to_s,
        boqBudget: boq_budget, contractValue: contract_value, paid: paid,
        variance: boq_budget - contract_value }
    end

    render json: { rows: rows, projects: projects,
                   kpi: { boq: kpi_boq, contract: kpi_contract, paid: kpi_paid,
                          variance: kpi_boq - kpi_contract } }
  end

  # Port of getSubconPayables() — code.js:6478
  def get_subcon_payables
    checks_map = SubconStatus.checks_map
    wp_map = {}
    WorkPackage.order(:id).each do |wp|
      wp_map[wp.wp_code] = { subId: wp.sub_code.to_s, subName: wp.subcontractor_name.to_s,
                             label: wp.label.to_s, project: wp.project_code.to_s }
    end

    rows = SubconMilestone.order(:id).filter_map do |mil|
      next unless SubconStatus.milestone_status(mil, checks_map)[:status] == "Ready to Pay"
      wp = wp_map[mil.wp_code.to_s]
      next unless wp
      { milId: mil.milestone_code, subId: wp[:subId], subName: wp[:subName],
        wpId: mil.wp_code, wpLabel: wp[:label], project: wp[:project],
        milLabel: mil.label.to_s, seq: mil.seq.to_i, amount: mil.amount.to_f }
    end
    render json: rows
  end

  # Port of generateWorkPackagePdf(wpId) — code.js:6631
  def generate_work_package_pdf
    wp = WorkPackage.find_by(wp_code: args[0].to_s.strip)
    raise "Work Package PDF failed: Work Package \"#{args[0]}\" not found." unless wp
    url = PdfGenerator.store(doc_type: "work_package", reference_code: wp.wp_code,
                             html: WpPdfBuilder.html(wp),
                             file_name: "#{wp.wp_code}_WorkPackage.pdf")
    render json: url
  end

  private

  # Port of getSubconNotifRecipients_() — code.js:5987 ("accounting" role)
  def subcon_notif_recipients
    User.where("LOWER(role) IN (?)", ["accounting", "accountant"]).pluck(:email).uniq
  end
end
