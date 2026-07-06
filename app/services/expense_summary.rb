# Port of getExpenseSummaryForProject(projectName) — Source/code.js:350.
class ExpenseSummary
  def self.call(project_name)
    total_budget = BoqItem.where(project_code: project_name).sum(:total_cost).to_f

    po_project_map = {}
    MrfItem.order(:id).each do |m|
      po_code = m.po_code.to_s.strip
      project = m.project_code.to_s.strip
      po_project_map[po_code] = project if po_code.present? && project.present?
    end

    total_mrf_utilized = 0.0
    PurchaseOrderItem.find_each do |p|
      po_code = p.po_number.to_s.strip
      next if po_code.blank?
      next if p.status.to_s.strip == "Voided"
      next unless po_project_map[po_code] == project_name
      total_mrf_utilized += p.quantity.to_f * p.unit_price.to_f
    end

    total_expenses = Expense.where(project_code: project_name).sum(:total_amount).to_f

    {
      totalBudget: total_budget,
      totalMrfUtilized: total_mrf_utilized,
      totalExpenses: total_expenses,
      totalRemaining: total_budget - total_mrf_utilized - total_expenses
    }
  end
end
