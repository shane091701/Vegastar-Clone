class Api::BoqController < Api::BaseController
  # Port of processBOQ(base64Data, fileName, projectCode, customerData) — code.js:2640
  def process_boq
    render json: BoqIngestor.call(base64_data: args[0].to_s, file_name: args[1].to_s,
                                  project_code: args[2].to_s, customer_data: arg(3))
  end

  # Port of getProjectsListOnly() — code.js:2880 (union of every sheet storing codes)
  def get_projects_list_only
    projects = Set.new
    Project.pluck(:code).each { |c| projects << c.to_s.strip if c.present? }
    BoqItem.distinct.pluck(:project_code).each { |c| projects << c.to_s.strip if c.present? }
    MrfItem.distinct.pluck(:project_code).each { |c| projects << c.to_s.strip if c.present? }
    Reimbursement.distinct.pluck(:project_code).each { |c| projects << c.to_s.strip if c.present? }
    render json: projects.to_a.sort
  end

  # Port of getProjectCompanyMap() — code.js:210. Logs first, then
  # Customer_Information as the authoritative override.
  def get_project_company_map
    map = {}
    BoqItem.where.not(project_code: [nil, ""]).where.not(company: [nil, ""])
           .pluck(:project_code, :company)
           .each { |code, company| map[code.strip] ||= company.strip }
    Project.where.not(company: [nil, ""]).pluck(:code, :company)
           .each { |code, company| map[code.to_s.strip] = company.to_s.strip }
    render json: map
  end

  # Port of getInitialData() — code.js:975. Items with per-unit-type budgets
  # and remaining amounts net of the Out ledger.
  def get_initial_data
    out_map = Hash.new(0.0)
    OutLedgerEntry.find_each do |o|
      next if o.item.blank? || o.project_code.blank?
      unit = o.unit.to_s.strip.downcase
      amount = unit == "lot" ? o.lot_amount.to_f : o.amount.to_f
      out_map["#{o.item}|#{o.project_code}|#{unit}"] += amount
    end

    phases = Set.new
    projects = Set.new
    items = []
    BoqItem.find_each do |b|
      next if b.item.blank? || b.project_code.blank?
      phases << b.phase if b.phase.present?
      projects << b.project_code
      unit = b.uom.to_s.strip
      budget_base = unit.downcase == "lot" ? b.total_cost.to_f : b.qty.to_f
      budget_mat = b.total_material.to_f
      budget_oth = b.labor_cost_k.to_f
      key = "#{b.item}|#{b.project_code}"
      items << {
        phase: b.phase, project: b.project_code, item: b.item, unit: unit,
        scope: b.scope.to_s.strip,
        budgetBase: budget_base, remBase: budget_base - out_map["#{key}|#{unit.downcase}"],
        budgetMat: budget_mat, remMat: budget_mat - out_map["#{key}|materials cost"],
        budgetOth: budget_oth, remOth: budget_oth - out_map["#{key}|labor cost"],
        budgetTot: budget_mat + budget_oth,
        remTot: (budget_mat + budget_oth) - out_map["#{key}|total cost"]
      }
    end
    render json: { items: items, phases: phases.to_a.sort, projects: projects.to_a.sort }
  end

  # Port of getBoqDataForAdjustment(projectName) — code.js:3517
  def get_boq_data_for_adjustment
    project = args[0].to_s
    items = BoqItem.where(project_code: project).order(:id).map do |b|
      unit = b.uom.to_s.strip
      {
        rowIdx: b.id,
        phase: b.phase.presence || "General",
        item: b.item.presence || "Unnamed Item",
        unit: unit,
        qty: unit.downcase == "lot" ? b.total_cost.to_f : b.qty.to_f,
        matCost: b.total_material.to_f,
        labCost: b.labor_cost_k.to_f
      }
    end
    render json: items
  end

  # Port of addBoqItem(payload, userEmail) — code.js:3545
  def add_boq_item
    payload = arg(0) || {}
    timestamp = Time.current
    ActiveRecord::Base.transaction do
      attrs = {
        phase: payload["phase"], item: payload["item"], uom: payload["unit"],
        total_material: BoqIngestor.clean_number(payload["matCost"]),
        labor_cost_k: BoqIngestor.clean_number(payload["labCost"]),
        project_code: payload["project"].to_s, entry_date: timestamp
      }
      if payload["unit"].to_s.downcase == "lot"
        attrs[:total_cost] = BoqIngestor.clean_number(payload["qty"])
      else
        attrs[:qty] = BoqIngestor.clean_number(payload["qty"])
      end
      BoqItem.create!(attrs)

      OutLedgerEntry.create!(
        phase: payload["phase"], item: payload["item"], amount: 0,
        unit: payload["unit"], entry_date: timestamp, project_code: payload["project"].to_s,
        control_code: "ADD-#{payload['project']}-#{(timestamp.to_f * 1000).to_i.to_s[-6..]}",
        movement_type: "BOQ Addition",
        remarks: "Added Item via UI. Reason: #{payload['reason']}",
        encoder_email: current_user.email
      )
    end
    render json: "Success"
  rescue => e
    raise "Failed to add item: #{e.message}"
  end

  # Port of adjustBoqItem(payload, userEmail) — code.js:3597
  def adjust_boq_item
    payload = arg(0) || {}
    timestamp = Time.current
    boq_item = BoqItem.find(payload["rowIdx"])
    old_mat = boq_item.total_material.to_f
    old_lab = boq_item.labor_cost_k.to_f

    ActiveRecord::Base.transaction do
      boq_item.update!(total_material: BoqIngestor.clean_number(payload["newMat"]),
                       labor_cost_k: BoqIngestor.clean_number(payload["newLab"]))
      OutLedgerEntry.create!(
        phase: boq_item.phase, item: boq_item.item, amount: 0, unit: "N/A",
        entry_date: timestamp, project_code: boq_item.project_code,
        control_code: "ADJ-#{boq_item.project_code}-#{(timestamp.to_f * 1000).to_i.to_s[-6..]}",
        movement_type: "BOQ Adjustment",
        remarks: "Mat: #{fmt_num(old_mat)}->#{payload['newMat']} | Lab: #{fmt_num(old_lab)}->#{payload['newLab']}. Reason: #{payload['reason']}",
        encoder_email: current_user.email
      )
    end
    render json: "Success"
  rescue ActiveRecord::RecordNotFound
    raise "Failed to adjust item: BOQ row not found."
  end

  private

  def fmt_num(f)
    f == f.to_i ? f.to_i.to_s : f.to_s
  end
end
