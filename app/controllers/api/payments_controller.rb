class Api::PaymentsController < Api::BaseController
  # Port of getPoListForPayments() — code.js:4165
  def get_po_list_for_payments
    po_project_map = {}
    MrfItem.order(:id).each do |m|
      po_code = m.po_code.to_s.strip
      project = m.project_code.to_s.strip
      po_project_map[po_code] = project if po_code.present? && project.present?
    end

    seen = Set.new
    result = []
    PurchaseOrderItem.order(:id).each do |p|
      po_code = p.po_number.to_s.strip
      next if po_code.blank? || seen.include?(po_code) || p.status.to_s.strip == "Voided"
      seen << po_code
      result << { poCode: po_code, supplier: p.supplier.to_s.strip,
                  project: po_project_map[po_code] || "Unassigned" }
    end
    render json: result.sort_by { |r| r[:poCode] }.reverse
  end

  # Port of getIssuePaymentDetails(poCodesArray) — code.js:4208
  def get_issue_payment_details
    all_terms = []
    (args[0] || []).each do |raw_code|
      po_code = raw_code.to_s.strip
      next if po_code.blank?

      base_received = DueDateCalculator.po_received_date(po_code)

      po_rows = PurchaseOrderItem.where(po_number: po_code).order(:id)
      po_total = po_rows.sum { |r| r.quantity.to_f * r.unit_price.to_f }
      supplier = po_rows.first&.supplier.to_s.strip

      mrf_id = MrfItem.where(po_code: po_code).order(:id).first&.mrf_code.to_s.strip

      terms = []
      if mrf_id.present? && supplier.present?
        PaymentTerm.where(mrf_code: mrf_id).order(:id).each do |t|
          next unless t.supplier.to_s.strip.downcase == supplier.downcase
          num = t.percentage.to_s.delete("%").strip.to_f
          pct = num > 1 ? num / 100 : num
          terms << { description: t.description.to_s.strip, percentage: pct,
                     dueDate: DueDateCalculator.compute_due_date(base_received, t.description.to_s) }
        end
      end

      paid_map = {}
      IssuePayment.where(po_number: po_code).order(:id).each do |ip|
        paid_map[ip.term_description.to_s.strip] = {
          isPaid: true,
          paymentDate: ip.due_date.to_s,
          bank: ip.bank.to_s,
          checkNumber: ip.check_number.to_s,
          paymentAmount: ip.payment_amount.to_f
        }
      end

      terms.each do |term|
        paid = paid_map[term[:description]]
        merged = paid ? term.merge(paid) : { isPaid: false }.merge(term)
        all_terms << { poCode: po_code, supplier: supplier, mrfId: mrf_id, poTotal: po_total }.merge(merged)
      end
    end
    render json: all_terms
  end

  # Port of saveIssuePayments(payload, userEmail) — code.js:4310
  def save_issue_payments
    payload = arg(0) || {}
    encoder = (args[1].presence || current_user.email).to_s

    ActiveRecord::Base.transaction do
      (payload["payments"] || []).each do |p|
        IssuePayment.create!(
          mrf_code: p["mrfId"], po_number: p["poCode"],
          term_description: p["termDesc"], percentage: "#{p['percentage']}%",
          supplier: p["supplier"], invoiced_amount: p["invoicedAmt"].to_f,
          due_date: p["paymentDate"].to_s, bank: p["bank"],
          check_number: p["checkNumber"], payment_amount: p["paymentAmount"].to_f,
          encoder_email: encoder
        )
      end
    end
    render json: "Success"
  rescue => e
    raise "Failed to save payments: #{e.message}"
  end

  # Port of getUniqueHistoricalItems() — code.js:4370
  def get_unique_historical_items
    items = PurchaseOrderItem.where.not(item_name: [nil, ""]).distinct.pluck(:item_name)
                             .map(&:strip).uniq.sort
    render json: items
  rescue => e
    raise "Failed to fetch unique items: #{e.message}"
  end

  # Port of getHistoricalPrices(searchQuery) — code.js:4397
  def get_historical_prices
    query = args[0].to_s.strip.downcase
    return render json: [] if query.blank?

    po_to_project = {}
    MrfItem.order(:id).each do |m|
      po_code = m.po_code.to_s.strip
      project = m.project_code.to_s.strip
      po_to_project[po_code] ||= project if po_code.present? && project.present?
    end

    results = []
    PurchaseOrderItem.order(:id).each do |p|
      item_name = p.item_name.to_s
      next unless item_name.downcase.include?(query)
      po_number = p.po_number.to_s.strip
      results << {
        date: p.order_date&.strftime("%Y-%m-%d").to_s,
        project: po_to_project[po_number] || "N/A",
        poNumber: po_number,
        supplier: p.supplier.to_s.strip,
        item: item_name.strip,
        unitPrice: p.unit_price.to_f
      }
    end
    render json: results.sort_by { |r| r[:date] }.reverse
  rescue => e
    raise "Failed to retrieve historical prices: #{e.message}"
  end
end
