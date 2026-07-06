# Port of getProjectPricingData(projectName) — Source/code.js:3771. Builds the
# expense-type hierarchy with "whichever is higher" Payroll/Materials rows,
# saved simulation state, and the 6% CGT row derived from LOT COST.
class PricingDataBuilder
  def self.call(project_name)
    grouped = {}

    ExpenseListEntry.order(:id).each do |e|
      type = e.expense_type.to_s.strip
      item = e.item_name.to_s.strip
      next if type.blank?
      grouped[type] ||= { "isLumpSum" => false, "lineItems" => [] }
      if item.present? && grouped[type]["lineItems"].none? { |li| li["name"] == item }
        grouped[type]["lineItems"] << blank_line(item)
      end
    end

    grouped.each_value do |grp|
      grp["lineItems"] << blank_line("Miscellaneous") unless grp["isLumpSum"]
    end

    # --- 3-way join: deliveries × PO items × mrf_items, by MRF unit class ---
    mrf_unit_map = {}
    project_po_codes = Set.new
    MrfItem.where(project_code: project_name).order(:id).each do |m|
      po_code = m.po_code.to_s.strip
      next if po_code.blank?
      project_po_codes << po_code
      mrf_unit_map["#{po_code}|#{m.item.to_s.strip}"] = m.unit.to_s.strip
    end

    unit_price_map = {}
    PurchaseOrderItem.find_each do |p|
      unit_price_map["#{p.po_number.to_s.strip}|#{p.item_name.to_s.strip}"] = p.unit_price.to_f
    end

    delivered_materials = delivered_payroll = delivered_total_cost = 0.0
    Delivery.find_each do |d|
      po_code = d.po_number.to_s.strip
      next unless project_po_codes.include?(po_code)
      key = "#{po_code}|#{d.item_name.to_s.strip}"
      cost = d.quantity.to_f * (unit_price_map[key] || 0.0)
      case mrf_unit_map[key] || ""
      when "Labor Cost" then delivered_payroll += cost
      when "Total Cost" then delivered_total_cost += cost
      when "Lot", "" then nil
      else delivered_materials += cost
      end
    end

    pcl_materials = Reimbursement.where(project_code: project_name)
                                 .select { |r| r.expense_type.to_s.strip.downcase.include?("material") }
                                 .sum { |r| r.amount.to_f }
    exp_materials = Expense.where(project_code: project_name)
                           .select { |e| e.expense_type.to_s.strip.downcase.include?("material") }
                           .sum { |e| e.total_amount.to_f }

    actual_materials = pcl_materials + exp_materials + delivered_materials
    actual_payroll = delivered_payroll
    actual_unsplit = delivered_total_cost

    boq_payroll = BoqItem.where(project_code: project_name).sum(:total_labor).to_f
    boq_materials = BoqItem.where(project_code: project_name).sum(:total_material).to_f

    final_materials = [actual_materials, boq_materials].max
    final_payroll = [actual_payroll, boq_payroll].max
    final_subgroup_total = final_materials + final_payroll + actual_unsplit

    grouped["Construction Materials"] = lump_sum(final_materials, informational: true)
    grouped["Payroll"] = lump_sum(final_payroll, informational: true)
    grouped["Materials + Payroll"] = lump_sum(final_subgroup_total, informational: false)

    # --- Manual expenses mapped onto line items (unknown items → Miscellaneous) ---
    expense_map = Hash.new(0.0)
    Expense.where(project_code: project_name).order(:id).each do |e|
      type = e.expense_type.to_s.strip
      raw_item = e.particular.to_s.strip
      grp = grouped[type]
      next unless grp && !grp["isLumpSum"]
      exists = grp["lineItems"].any? { |li| li["name"] == raw_item && li["name"] != "Miscellaneous" }
      actual_item = exists ? raw_item : "Miscellaneous"
      expense_map["#{type}|||#{actual_item}"] += e.total_amount.to_f
    end

    # --- Saved simulation state (newest rows win) ---
    saved_state = {}
    PricingSimulation.where(project_title: project_name).order(:id).each do |s|
      pct = s.percentage.to_f
      pct *= 100 if pct < 1 && pct > 0
      saved_state["#{s.expense_type.to_s.strip}|||#{s.line_item.to_s.strip}"] = {
        pct: pct, override: s.override_amount.nil? ? "" : s.override_amount.to_f
      }
    end

    grouped.each do |type, grp|
      if grp["isLumpSum"]
        state = saved_state["#{type}|||N/A"]
        if state
          grp["savedPct"] = state[:pct]
          grp["savedOverride"] = state[:override]
        end
      else
        type_total = 0.0
        grp["lineItems"].each do |li|
          key = "#{type}|||#{li['name']}"
          li["amount"] = expense_map[key] || 0.0
          type_total += li["amount"]
          state = saved_state[key]
          if state
            li["savedPct"] = state[:pct]
            li["savedOverride"] = state[:override]
          end
        end
        grp["amount"] = type_total
      end
    end

    # --- CGT: 6% of LOT COST, spliced after the LOT COST row ---
    grouped.each_value do |grp|
      next if grp["isLumpSum"] || grp["lineItems"].nil?
      lot_idx = grp["lineItems"].index { |li| li["name"].to_s.strip.upcase == "LOT COST" }
      next unless lot_idx
      cgt_amount = grp["lineItems"][lot_idx]["amount"].to_f * 0.06
      grp["lineItems"].insert(lot_idx + 1, {
        "name" => "Capital Gains Tax (CGT) - 6%", "amount" => cgt_amount,
        "savedPct" => 0, "savedOverride" => "", "isReadOnly" => true
      })
      grp["amount"] = grp["amount"].to_f + cgt_amount
    end

    grouped
  end

  def self.blank_line(name)
    { "name" => name, "amount" => 0, "savedPct" => 0, "savedOverride" => "" }
  end

  def self.lump_sum(amount, informational:)
    { "isLumpSum" => true, "isInformational" => informational, "amount" => amount,
      "savedPct" => 0, "savedOverride" => "", "lineItems" => [] }
  end
end
