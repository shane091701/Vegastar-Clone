class Api::MrfController < Api::BaseController
  # Port of submitRequest(payload, userEmail) — code.js:1190
  def submit_request
    payload = args[0] || []
    requester = (args[1].presence || current_user.email).to_s
    valid = payload.map { |r| r.respond_to?(:to_unsafe_h) ? r.to_unsafe_h : r }
                   .select { |r| r["qty"].present? }
    raise "No items valid for submission." if valid.empty?

    project_name = valid[0]["project"].to_s
    scope_map = {}
    BoqItem.where(project_code: valid.map { |r| r["project"] }.uniq).find_each do |b|
      next if b.phase.blank? || b.item.blank? || b.project_code.blank?
      scope_map["#{b.project_code}|#{b.phase.strip}|#{b.item.strip}"] = b.scope.to_s.strip
    end

    timestamp = Time.current
    mrf_code = SequencedCode.next_mrf_code(project_name)

    ActiveRecord::Base.transaction do
      valid.each do |req|
        unit = req["unit"].to_s
        is_lot = unit.downcase == "lot"
        scope = scope_map["#{req['project']}|#{req['phase']}|#{req['item']}"].presence ||
                (req["item"].to_s.include?(" > ") ? req["item"].to_s.split(" > ").first.strip : "")

        OutLedgerEntry.create!(
          phase: req["phase"], item: req["item"],
          amount: is_lot ? nil : req["qty"],
          unit: unit, entry_date: timestamp, project_code: req["project"],
          lot_amount: is_lot ? req["qty"] : nil,
          control_code: "#{mrf_code}-#{req['item']}",
          movement_type: "Material Request"
        )

        MrfItem.create!(
          entry_date: timestamp, item: req["item"], unit: unit,
          request_amount: req["qty"], project_code: req["project"], phase: req["phase"],
          status: "Pending", mrf_code: mrf_code, requester_email: requester,
          remarks: req["remarks"].to_s, scope: scope
        )
      end
    end

    begin
      approvers = User.where("LOWER(role) IN (?)", ["approver", "admin"]).pluck(:email)
      if approvers.any?
        items = valid.map { |r| { item: r["item"], unit: r["unit"], qty: r["qty"] } }
        MrfMailer.new_request(project_name, requester, items, false, approvers).deliver_now
      end
    rescue => e
      Rails.logger.error("submitRequest notify failed: #{e.message}")
    end
    render json: nil
  end

  # Port of getRequestHistory() — code.js:1294
  def get_request_history
    rows = MrfItem.order(:id).map do |m|
      {
        date: m.entry_date&.strftime("%b %d, %Y"),
        item: m.item, unit: m.unit, qty: m.request_amount.to_f,
        project: m.project_code, phase: m.phase,
        status: m.status.presence || "Pending",
        mrfCode: m.mrf_code.to_s, remarks: m.remarks.to_s, scope: m.scope.to_s
      }
    end
    render json: rows.reverse
  end

  # Port of getApprovalQueueData() — code.js:1420
  def get_approval_queue_data
    out_map = Hash.new(0.0)
    OutLedgerEntry.find_each do |o|
      next if o.item.blank? || o.project_code.blank?
      unit = o.unit.to_s.strip.downcase
      amount = unit == "lot" ? o.lot_amount.to_f : o.amount.to_f
      out_map["#{o.item}|#{o.project_code}|#{unit}"] += amount
    end

    budget_map = {}
    BoqItem.find_each do |b|
      next if b.item.blank? || b.project_code.blank?
      base_unit = b.uom.to_s.strip.downcase
      key = "#{b.item}|#{b.project_code}"
      budget_map["#{key}|#{base_unit}"] = base_unit == "lot" ? b.total_cost.to_f : b.qty.to_f
      budget_map["#{key}|materials cost"] = b.total_material.to_f
      budget_map["#{key}|labor cost"] = b.labor_cost_k.to_f
      budget_map["#{key}|total cost"] = b.total_material.to_f + b.labor_cost_k.to_f
    end

    pending = {}
    projects = Set.new

    MrfItem.order(:id).each do |m|
      next unless m.status.to_s.strip.downcase == "pending"
      group_id = m.mrf_code.to_s
      unit = m.unit.to_s.strip
      req_qty = m.request_amount.to_f
      projects << m.project_code

      key = "#{m.item}|#{m.project_code}|#{unit.downcase}"
      budget = budget_map[key] || 0.0
      total_used = out_map[key] || 0.0

      pending[group_id] ||= {
        id: group_id, user: m.requester_email.presence || "Unknown",
        code: m.project_code,
        date: m.entry_date&.strftime("%b %d, %Y"),
        rawDate: m.entry_date.to_i * 1000,
        items: []
      }
      pending[group_id][:items] << {
        phase: m.phase, description: m.item, reqQty: req_qty, unit: unit,
        fullItemCode: group_id,
        budget: budget,
        remainingBeforeApprove: budget - (total_used - req_qty),
        scope: m.scope.to_s.strip,
        remarks: m.remarks.to_s.strip
      }
    end

    ReturnableItem.where(status: "Pending").order(:id).each do |r|
      group_id = "RET-#{r.project_code}"
      projects << r.project_code
      pending[group_id] ||= {
        id: group_id, user: r.requester_email, code: r.project_code,
        date: r.created_at.strftime("%b %d, %Y"),
        rawDate: r.created_at.to_i * 1000,
        items: []
      }
      pending[group_id][:items] << {
        phase: "RETURNABLE TOOL", description: r.item_name,
        reqQty: r.quantity.to_f, unit: "Units",
        fullItemCode: "RET-ITEM-#{r.id}",
        budget: 0, remainingBeforeApprove: r.quantity.to_f
      }
    end

    sorted = pending.values.sort_by { |g| -(g[:rawDate] || 0) }
    render json: { requests: sorted, projects: projects.to_a.sort }
  end

  # Port of processApproval(requestId, action, remarksArray, qtysArray,
  # filesData, userEmail, preferredBrandsArray) — code.js:1550
  def process_approval
    request_id = args[0].to_s
    action = args[1].to_s
    remarks_array = args[2] || []
    qtys_array = args[3] || []
    files_data = (args[4] || []).map { |f| f.respond_to?(:to_unsafe_h) ? f.to_unsafe_h : f }
    brands_array = args[6] || []
    timestamp = Time.current

    return process_returnable_approval(request_id, action, remarks_array, qtys_array) if request_id.start_with?("RET-")

    rows = MrfItem.where(mrf_code: request_id)
                  .where("LOWER(TRIM(status)) = 'pending'").order(:id).to_a

    file_urls = {}
    if action == "Approve" && files_data.any?
      files_data.each do |f|
        row = rows[f["idx"].to_i]
        next unless row
        row.attachment.attach(
          io: StringIO.new(Base64.decode64(f["data"].to_s)),
          filename: "#{request_id}_#{f['name']}", content_type: f["mimeType"].to_s
        )
        file_urls[f["idx"].to_i] = Rails.application.routes.url_helpers.rails_blob_path(
          row.reload.attachment, disposition: "inline", only_path: true
        )
      end
    end

    approved_items = []
    processed_items = []
    requestor_email = rows.first&.requester_email.to_s
    project_name = rows.first&.project_code.to_s

    ActiveRecord::Base.transaction do
      rows.each_with_index do |row, mi|
        status = action == "Approve" ? "Approved" : "Rejected"
        app_qty = qtys_array[mi].nil? ? row.request_amount : qtys_array[mi]
        control_code = "#{row.mrf_code}-#{row.item}"
        uploaded_url = file_urls[mi].to_s

        processed_items << { description: row.item, unit: row.unit, reqQty: row.request_amount.to_f,
                             appQty: app_qty, remarks: remarks_array[mi].to_s }

        row.update!(status: status, remarks: remarks_array[mi].to_s,
                    attachment_url: uploaded_url, approved_qty: app_qty,
                    action_timestamp: timestamp, win_loss: "", po_code: "",
                    preferred_brands: brands_array[mi].to_s)

        if status == "Rejected"
          OutLedger.remove_entry(control_code)
        else
          OutLedger.update_entry(control_code, app_qty, row.unit)
          approved_items << { item: row.item, qty: app_qty, unit: row.unit,
                              attachmentUrl: uploaded_url, brand: brands_array[mi].to_s }
        end
      end
    end

    if requestor_email.present? && processed_items.any?
      begin
        MrfMailer.approval_result(action, request_id, project_name, requestor_email, processed_items).deliver_now
      rescue => e
        Rails.logger.error("processApproval notify failed: #{e.message}")
      end
    end

    if action == "Approve" && approved_items.any?
      rfq_url = PdfGenerator.store(doc_type: "rfq", reference_code: request_id,
                                   html: RfqPdfBuilder.html(request_id, approved_items),
                                   file_name: "RFQ_#{request_id}.pdf")
      MrfItem.where(mrf_code: request_id).update_all(pdf_url: rfq_url)
      return render json: rfq_url
    end
    render json: true
  end

  # Port of getRFQsList() — code.js:1323
  def get_rfqs_list
    seen = Set.new
    rfqs = []
    MrfItem.order(:id).each do |m|
      mrf_id = m.mrf_code.to_s
      next unless m.status.to_s.strip == "Approved"
      next if m.pdf_url.to_s.strip.blank?
      next if seen.include?(mrf_id)
      seen << mrf_id
      rfqs << {
        mrfId: mrf_id,
        date: m.entry_date&.strftime("%b %d, %Y"),
        rawDate: m.entry_date.to_i,
        project: m.project_code.to_s.strip,
        url: m.pdf_url.to_s.strip,
        hasPo: m.po_code.to_s.strip.present?,
        createdBy: m.requester_email.present? ? m.requester_email.split("@").first : "Unknown"
      }
    end
    render json: rfqs.sort_by { |r| -r[:rawDate] }.each { |r| r.delete(:rawDate) }
  end

  # Port of voidAlphaRFQ(mrfId, reason, userEmail) — code.js:1356
  def void_alpha_rfq
    mrf_id = args[0].to_s
    reason = args[1].to_s
    rows = MrfItem.where(mrf_code: mrf_id).where("TRIM(status) = 'Approved'").order(:id).to_a

    rows.each do |row|
      if row.po_code.to_s.strip.present?
        raise "Action Denied: A Purchase Order (#{row.po_code.strip}) already exists for this RFQ. Please void the PO first."
      end
    end
    raise "No approved items found for RFQ \"#{mrf_id}\". It may already be voided." if rows.empty?

    void_note = "[VOIDED #{Time.current.strftime('%Y-%m-%d %H:%M')} by #{current_user.email}: #{reason}]"
    ActiveRecord::Base.transaction do
      rows.each do |row|
        row.update!(status: "Voided",
                    remarks: row.remarks.present? ? "#{row.remarks} | #{void_note}" : void_note)
        OutLedger.remove_entry("#{row.mrf_code}-#{row.item}")
      end
    end
    render json: "RFQ \"#{mrf_id}\" has been voided and #{rows.length} item(s) restored to the BOQ budget."
  end

  # Port of submitReturnableRequest(payload, userEmail) — code.js:3648
  def submit_returnable_request
    payload = arg(0) || {}
    requester = (args[1].presence || current_user.email).to_s
    items = (payload["items"] || []).select { |it| it["item"].present? && it["qty"].to_f > 0 }
    raise "No valid returnable items to submit." if items.empty?

    items.each do |it|
      ReturnableItem.create!(project_code: payload["project"], item_name: it["item"],
                             quantity: it["qty"].to_f, requester_email: requester, status: "Pending")
    end

    begin
      approvers = User.where("LOWER(role) IN (?)", ["approver", "admin"]).pluck(:email)
      if approvers.any?
        email_items = items.map { |it| { item: it["item"], unit: "Units", qty: it["qty"].to_f } }
        MrfMailer.new_request(payload["project"], requester, email_items, true, approvers).deliver_now
      end
    rescue => e
      Rails.logger.error("submitReturnableRequest notify failed: #{e.message}")
    end
    render json: "Success"
  end

  # Port of getReturnableItemsData() — code.js:3689
  def get_returnable_items_data
    rows = ReturnableItem.order(:id).map do |r|
      {
        date: r.created_at.strftime("%b %d, %Y"),
        project: r.project_code, item: r.item_name, qty: r.quantity.to_f,
        requester: r.requester_email.present? ? r.requester_email.split("@").first : "Unknown",
        status: r.status.presence || "Pending"
      }
    end
    render json: rows.reverse
  end

  private

  # Returnable-items branch of processApproval — code.js:1555
  def process_returnable_approval(request_id, action, remarks_array, qtys_array)
    target_project = request_id.delete_prefix("RET-")
    rows = ReturnableItem.where(project_code: target_project, status: "Pending").order(:id).to_a
    status = action == "Approve" ? "Approved" : "Rejected"

    requestor_email = ""
    processed_items = []
    rows.each_with_index do |row, mi|
      app_qty = qtys_array[mi].presence || row.quantity
      requestor_email = row.requester_email.to_s if requestor_email.blank?
      processed_items << { description: row.item_name, unit: "Units", reqQty: row.quantity.to_f,
                           appQty: app_qty, remarks: remarks_array[mi].to_s }
      row.update!(quantity: app_qty, status: status)
    end

    if requestor_email.present? && processed_items.any?
      begin
        MrfMailer.approval_result(action, request_id, target_project, requestor_email, processed_items).deliver_now
      rescue => e
        Rails.logger.error("processApproval returnable notify failed: #{e.message}")
      end
    end
    render json: "Processed Returnable Items successfully. Skipped RFQ/PO generation."
  end
end
