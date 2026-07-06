# Port of saveWorkPackage(payload, userEmail) — Source/code.js:5602.
# Validates, prorates the contract value across selected BOQ lines, and
# creates the work package + lines + milestones + audit entries.
class WorkPackageCreator
  def self.call(payload, user_email)
    raise "Project is required." if payload["project"].blank?

    contract_value = payload["contractValue"].to_f
    raise "Contract value must be greater than 0." if contract_value <= 0

    sub = Subcontractor.find_by(sub_code: payload["subId"].to_s.strip)
    raise "Subcontractor not found." unless sub
    raise "Selected subcontractor is not active." unless sub.active
    sub_name = sub.name.to_s.strip

    lines = payload["lines"] || []
    raise "At least one BOQ line must be selected." if lines.empty?

    live_wp_codes = WorkPackage.where.not("LOWER(status) = 'voided'").pluck(:wp_code)
    claimed_keys = WpBoqLine.where(wp_code: live_wp_codes).pluck(:project_code, :phase, :scope, :item)
                            .map { |parts| parts.map(&:to_s).join("|") }.to_set
    conflict = lines.find { |l| claimed_keys.include?("#{payload['project']}|#{l['phase']}|#{l['scope']}|#{l['item']}") }
    raise "BOQ line already assigned to another work package: #{conflict['item']}" if conflict

    milestones = payload["milestones"] || []
    raise "At least one milestone is required." if milestones.empty?

    seqs_seen = Set.new
    payment_sum = 0.0
    milestones.each_with_index do |m, i|
      raise "Milestone #{i + 1}: label is required." if m["label"].to_s.strip.blank?
      seq = m["seq"].to_f
      raise "Milestone #{i + 1}: sequence must be an integer ≥ 1." unless seq == seq.to_i && seq >= 1
      raise "Duplicate milestone sequence: #{seq.to_i}" if seqs_seen.include?(seq.to_i)
      seqs_seen << seq.to_i
      target = m["targetPct"].to_f
      raise "Milestone #{i + 1}: Target % must be between 1 and 100." if target <= 0 || target > 100
      raise "Milestone #{i + 1}: Payment % must be > 0." if m["paymentPct"].to_f <= 0
      payment_sum += m["paymentPct"].to_f
    end
    unless (payment_sum * 100).round == 10_000
      raise "Milestone payment % must sum to exactly 100%. Current total: #{fmt_num(payment_sum)}%."
    end

    amount_sum = milestones.sum { |m| (m["paymentPct"].to_f / 100 * contract_value * 100).round / 100.0 }
    if ((amount_sum * 100).round - (contract_value * 100).round).abs > 1
      raise "Milestone amounts do not sum to contract value. Please check rounding."
    end

    basis = payload["basis"].to_s.downcase
    selected_sum = lines.sum { |l| line_cost(l, basis) }
    multiplier = selected_sum > 0 ? contract_value / selected_sum : 0

    wp_code = SequencedCode.next_wp_code
    now = Time.current

    wp = nil
    ActiveRecord::Base.transaction do
      wp = WorkPackage.create!(
        wp_code: wp_code, sub_code: sub.sub_code, subcontractor_name: sub_name,
        project_code: payload["project"], label: payload["label"],
        budget_basis: payload["basis"].to_s, contract_value: contract_value,
        status: "Open", created_by: user_email
      )

      if payload.dig("contractFile", "data").present?
        begin
          f = payload["contractFile"]
          wp.contract_pdf.attach(io: StringIO.new(Base64.decode64(f["data"].to_s)),
                                 filename: "#{wp_code}_contract_#{f['name']}",
                                 content_type: f["mimeType"].to_s)
          wp.update!(contract_pdf_url: Rails.application.routes.url_helpers.rails_blob_path(
            wp.reload.contract_pdf, disposition: "inline", only_path: true
          ))
        rescue => e
          Rails.logger.error("saveWorkPackage contract pdf: #{e.message}")
        end
      end

      lines.each do |l|
        boq_cost = line_cost(l, basis)
        WpBoqLine.create!(wp_code: wp_code, project_code: payload["project"],
                          phase: l["phase"], scope: l["scope"], item: l["item"],
                          boq_cost: boq_cost,
                          allocated_cost: (boq_cost * multiplier * 100).round / 100.0)
      end

      milestones.each do |m|
        SubconMilestone.create!(
          milestone_code: SequencedCode.next_milestone_code, wp_code: wp_code,
          seq: m["seq"].to_i, label: m["label"], target_pct: m["targetPct"].to_f,
          payment_pct: m["paymentPct"].to_f,
          amount: (m["paymentPct"].to_f / 100 * contract_value * 100).round / 100.0,
          ready_to_pay: false, check_number: "", status: "Open"
        )
      end

      SubconAudit.log!("WorkPackage", wp_code, "create work package",
                       "Project: #{payload['project']} | Sub: #{sub_name} | Lines: #{lines.length}", user_email)
      SubconMilestone.where(wp_code: wp_code).order(:id).each do |mil|
        SubconAudit.log!("Milestone", mil.milestone_code, "create milestone",
                         "WP: #{wp_code} | #{mil.label}", user_email)
      end
    end

    { wpId: wp_code, saved: lines.length }
  end

  def self.line_cost(line, basis)
    case basis
    when "labor" then line["costLabor"].to_f
    when "material" then line["costMaterial"].to_f
    else line["costTotal"].to_f
    end
  end

  def self.fmt_num(f)
    f == f.to_i ? f.to_i.to_s : f.to_s
  end
end
