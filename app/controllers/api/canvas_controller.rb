class Api::CanvasController < Api::BaseController
  # Port of getPendingQuoteMRFs() — code.js:1791
  def get_pending_quote_mrfs
    projects = Set.new
    mrf_map = {}
    items = []
    MrfItem.order(:id).each do |m|
      next unless m.status == "Approved" && m.po_code.to_s.strip.blank?
      mrf_id = m.mrf_code.to_s
      project = m.project_code.to_s.strip
      projects << project
      mrf_map[mrf_id] = project
      items << { mrfId: mrf_id, description: m.item, qty: m.approved_qty.to_f, unit: m.unit }
    end
    render json: { projects: projects.to_a.sort, mrfMap: mrf_map, items: items }
  end

  # Port of saveSupplierQuotes(mrfId, supplier, quotes, paymentTerms, userEmail, deliveryFee) — code.js:1820
  def save_supplier_quotes
    mrf_id = args[0].to_s.strip
    supplier = args[1].to_s.strip
    quotes = args[2] || []
    payment_terms = args[3] || []
    fee = args[5].to_f

    ActiveRecord::Base.transaction do
      quotes.each do |q|
        SupplierQuote.create!(mrf_code: mrf_id, item: q["item"].to_s.strip, supplier: supplier,
                              amount: q["amount"], encoder_email: current_user.email,
                              brand: q["brand"].to_s, delivery_fee: fee.to_s)
      end
      payment_terms.each do |term|
        PaymentTerm.create!(mrf_code: mrf_id, supplier: supplier,
                            description: term["description"].to_s.strip,
                            percentage: "#{term['percentage']}%")
      end
    end
    render json: true
  end

  # Port of getCanvasMRFList() — code.js:1873
  def get_canvas_mrf_list
    details = {}
    MrfItem.order(:id).each do |m|
      mrf_id = m.mrf_code.to_s
      next if mrf_id.blank?
      details[mrf_id] = { project: m.project_code.to_s.strip,
                          hasPo: m.po_code.to_s.strip.present? }
    end
    mrfs = SupplierQuote.distinct.pluck(:mrf_code).compact.map(&:strip).uniq
    render json: mrfs.map { |mrf_id|
      d = details[mrf_id]
      { mrfId: mrf_id, project: d ? d[:project] : "Unknown", hasPo: d ? d[:hasPo] : false }
    }
  end

  # Port of getCanvasPivotData(mrfId) — code.js:1901
  def get_canvas_pivot_data
    target = args[0].to_s.strip
    project = MrfItem.where(mrf_code: target).order(:id).first&.project_code.to_s.strip

    item_budget_map = Hash.new(0.0)
    BoqItem.where(project_code: project).find_each do |b|
      key = b.item.to_s.strip
      base = b.qty.to_f.nonzero? || b.total_cost.to_f
      item_budget_map[key] += base + b.total_material.to_f + b.labor_cost_k.to_f
    end

    po_unit_price_map = {}
    po_supplier_map = {}
    PurchaseOrderItem.find_each do |p|
      code = p.po_number.to_s.strip
      po_unit_price_map["#{code}|#{p.item_name.to_s.strip}"] = p.unit_price.to_f
      po_supplier_map[code] = p.supplier.to_s.strip
    end

    delivered_cost_map = Hash.new(0.0)
    Delivery.find_each do |d|
      item_name = d.item_name.to_s.strip
      unit_price = po_unit_price_map["#{d.po_number.to_s.strip}|#{item_name}"] || 0.0
      delivered_cost_map[item_name] += d.quantity.to_f * unit_price
    end

    items_map = {}
    MrfItem.where(mrf_code: target).order(:id).each do |m|
      item_name = m.item.to_s.strip
      po_code = m.po_code.to_s.strip
      winning = (m.win_loss == "Win" && po_code.present?) ? po_supplier_map[po_code] : nil
      items_map[item_name] = {
        desc: item_name, qty: m.approved_qty.to_f, unit: m.unit,
        remainingCost: (item_budget_map[item_name] || 0.0) - (delivered_cost_map[item_name] || 0.0),
        hasPo: po_code.present?,
        winningSupplier: winning,
        quotes: {}
      }
    end

    suppliers = []
    SupplierQuote.where(mrf_code: target).order(:id).each do |q|
      sup = q.supplier.to_s.strip
      suppliers << sup unless suppliers.include?(sup)
      matched = items_map.keys.find { |k| k.downcase == q.item.to_s.strip.downcase }
      items_map[matched][:quotes][sup] = q.amount.to_f if matched
    end

    render json: { suppliers: suppliers, items: items_map.values }
  end

  # Port of awardCanvasWinners(mrfId, winners, userEmail) — code.js:1980
  def award_canvas_winners
    winners = (args[1] || []).map { |w| w.respond_to?(:to_unsafe_h) ? w.to_unsafe_h : w }
    render json: CanvasAwarder.call(mrf_code: args[0].to_s, winners: winners, user: current_user)
  end

  # The SUKI endpoints are called by the client but were never implemented in
  # the original server code — reproduce the same failure the original showed.
  def get_suki_items
    raise "Script function not found: getSukiItems"
  end

  def submit_suki_pricing
    raise "Script function not found: submitSukiPricing"
  end
end
