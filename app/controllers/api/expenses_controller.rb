class Api::ExpensesController < Api::BaseController
  REFUNDABLE_ITEMS = ["H.O: CONSTRUCTION BOND"].freeze

  # Port of getExpenseInitialData() — code.js:256
  def get_expense_initial_data
    projects = BoqItem.where.not(project_code: [nil, ""]).distinct.pluck(:project_code)
    hidden = HiddenExpenseProject.pluck(:project_name).to_set
    render json: { projects: projects.reject { |p| hidden.include?(p) }.sort,
                   categories: expense_list }
  end

  # Port of getExpenseTypesAndItems() — code.js:4027
  def get_expense_types_and_items
    dict = {}
    ExpenseListEntry.order(:id).each do |e|
      type = e.expense_type.to_s.strip
      item = e.item_name.to_s.strip
      next if type.blank?
      dict[type] ||= []
      dict[type] << item if item.present? && !dict[type].include?(item)
    end
    render json: dict
  end

  # Port of getExpenseProjectManageData() — code.js:289
  def get_expense_project_manage_data
    all_projects = BoqItem.where.not(project_code: [nil, ""]).distinct.pluck(:project_code).sort
    render json: { allProjects: all_projects,
                   hiddenProjects: HiddenExpenseProject.pluck(:project_name) }
  end

  # Port of toggleHiddenExpenseProject(projectName, hide, userEmail) — code.js:307
  def toggle_hidden_expense_project
    project_name = args[0].to_s.strip
    hide = !!args[1]
    existing = HiddenExpenseProject.find_by(project_name: project_name)
    if hide
      HiddenExpenseProject.create!(project_name: project_name, hidden_by: current_user.email) unless existing
    else
      existing&.destroy!
    end
    render json: "Success"
  rescue => e
    raise "Failed to update hidden project list: #{e.message}"
  end

  # Port of submitExpenses(payload, encoderEmail) — code.js:428
  def submit_expenses
    payload = args[0] || []
    encoder = (args[1].presence || current_user.email).to_s
    date = Time.current

    ActiveRecord::Base.transaction do
      payload.each do |exp|
        total_amt = exp["totalAmount"].to_s.delete(",").to_f
        Expense.create!(entry_date: date, project_code: exp["project"],
                        expense_type: exp["type"], particular: exp["particular"],
                        total_amount: total_amt, encoder_email: encoder)

        if REFUNDABLE_ITEMS.any? { |i| i.strip.upcase == exp["particular"].to_s.strip.upcase }
          PendingRefund.create!(entry_date: date, project_code: exp["project"],
                                particular: exp["particular"], total_amount: total_amt,
                                status: "Pending", encoder_email: encoder)
        end
      end
    end
    render json: "Success"
  end

  # Port of getPendingRefunds() — code.js:468
  def get_pending_refunds
    rows = PendingRefund.where(status: "Pending").order(:id).map do |r|
      {
        rowIndex: r.id,
        date: r.entry_date&.strftime("%b %d, %Y").to_s,
        project: r.project_code.to_s,
        particular: r.particular.to_s,
        originalAmount: r.total_amount.to_f
      }
    end
    render json: rows
  rescue => e
    raise "Failed to fetch pending refunds: #{e.message}"
  end

  # Port of submitRefundCredit(rowIndex, refundAmount, project, particular, userEmail)
  # — code.js:520. Pure record-keeping: no Expenses/budget impact.
  def submit_refund_credit
    refund = PendingRefund.find(args[0])
    refund.update!(status: "Refunded", refunded_amount: args[1], refund_date: Time.current)
    render json: "Success"
  rescue ActiveRecord::RecordNotFound => e
    raise "Failed to process refund: #{e.message}"
  end

  # Port of getExpenseSummaryForProject(projectName) — code.js:350
  def get_expense_summary_for_project
    render json: ExpenseSummary.call(args[0].to_s)
  end

  # Port of getMyRecentExpenses(userEmail) — code.js:896
  def get_my_recent_expenses
    target = (args[0].presence || current_user.email).to_s.strip.downcase
    results = Expense.order(:id).select { |e| e.encoder_email.to_s.strip.downcase == target }
                     .map do |e|
      {
        date: e.entry_date&.strftime("%b %d, %Y").to_s,
        rawTs: e.entry_date.to_i * 1000,
        project: e.project_code.to_s, type: e.expense_type.to_s,
        particular: e.particular.to_s, qty: "", amount: 0,
        totalAmount: e.total_amount.to_f, encoder: e.encoder_email.to_s
      }
    end
    render json: results.sort_by { |r| -r[:rawTs] }
  rescue => e
    raise "Failed to load expense history: #{e.message}"
  end

  private

  # Port of getExpenseList_() — code.js:336
  def expense_list
    list = ExpenseListEntry.where.not(expense_type: [nil, ""]).distinct.pluck(:expense_type)
    list.presence || ["Labor", "Material"]
  end
end
