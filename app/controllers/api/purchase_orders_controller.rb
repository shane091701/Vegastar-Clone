class Api::PurchaseOrdersController < Api::BaseController
  # Port of getPurchaseOrders() — code.js:2354
  def get_purchase_orders
    paid_map = Hash.new(0.0)
    IssuePayment.find_each do |ip|
      code = ip.po_number.to_s.strip
      paid_map[code] += ip.payment_amount.to_f if code.present?
    end

    po_items = PurchaseOrderItem.order(:id).to_a
    rows = MrfItem.where.not(po_code: [nil, ""]).order(:id).to_a
                  .sort_by { |m| -(m.action_timestamp || Time.at(0)).to_i }

    processed = Set.new
    pos = []
    rows.each do |row|
      po_code = row.po_code.to_s.strip
      next if processed.include?(po_code)
      processed << po_code

      items_in_po = po_items.select { |p| p.po_number.to_s.strip == po_code }
      total = items_in_po.sum { |p| p.quantity.to_f * p.unit_price.to_f }
      paid = paid_map[po_code]
      payment_status =
        if paid.zero? then "Not Yet Paid"
        elsif paid < total then "Partially Paid"
        else "Fully Paid"
        end

      pos << {
        poNumber: po_code,
        supplier: items_in_po.first&.supplier || "N/A",
        projectName: row.project_code.presence || "N/A",
        phase: row.phase.presence || "N/A",
        total: total,
        status: PoStatusCalculator.call(po_code),
        paymentStatus: payment_status,
        pdfUrl: row.pdf_url.to_s
      }
    end
    render json: pos
  end

  # Port of dispatchAlphaPO(poCode, userEmail) — code.js:2120
  def dispatch_alpha_po
    po_code = args[0].to_s.strip
    first_item = PurchaseOrderItem.where(po_number: po_code).order(:id).first
    raise "PO not found in the database." unless first_item

    current_status = first_item.status.to_s.strip
    raise "Action Denied: This PO has already been dispatched to the supplier." if current_status == "Sent"
    unless current_status == "Draft"
      raise "Action Denied: You can only dispatch 'Draft' POs. This PO is currently marked as '#{current_status}'."
    end

    supplier_name = first_item.supplier.to_s.strip
    supplier = Supplier.where("LOWER(TRIM(company_name)) = ?", supplier_name.downcase).first
    target_email = supplier&.email.to_s.strip
    if target_email.blank?
      raise "Cannot dispatch: No email found for supplier \"#{supplier_name}\". Please add them to the \"Supplier Data\" module first."
    end

    signer = { name: current_user.name.presence || "Authorized Personnel", base64Image: signature_data_uri(current_user) }

    representative = MrfItem.where(po_code: po_code).order(:id).first
    raise "Could not find original MRF data to generate the PDF." unless representative

    pdf_html = PoPdfBuilder.html(po_code: po_code, project: representative.project_code,
                                 supplier: supplier_name, mrf_code: representative.mrf_code, signer: signer)
    pdf_data = PdfGenerator.render_pdf(pdf_html)
    record = GeneratedPdf.for("po", po_code)
    record.file.attach(io: StringIO.new(pdf_data), filename: "#{po_code}_Signed.pdf",
                       content_type: "application/pdf")
    new_pdf_url = Rails.application.routes.url_helpers.rails_blob_path(
      record.reload.file, disposition: "inline", only_path: true
    )

    PoMailer.dispatch(target_email, po_code, supplier_name,
                      representative.project_code.presence || "our project",
                      signer[:name], pdf_data).deliver_now

    ActiveRecord::Base.transaction do
      first_item.update!(status: "Sent")
      MrfItem.where(po_code: po_code).update_all(pdf_url: new_pdf_url)
    end

    render json: "Success! PO #{po_code} signed and automatically emailed to #{target_email}"
  end

  # Port of voidAlphaPO(poCode, reason, userEmail) — code.js:3712
  def void_alpha_po
    po_code = args[0].to_s.strip
    reason = args[1].to_s
    first_item = PurchaseOrderItem.where(po_number: po_code).order(:id).first
    raise "PO not found in the database." unless first_item

    current_status = first_item.status.to_s.strip
    if ["Partial delivery", "Received all"].include?(current_status)
      raise "Action Denied: Items from this PO have already arrived on site. It cannot be voided as it is now locked in the financial ledger."
    end
    raise "Action Denied: This PO is already voided." if current_status == "Voided"

    ActiveRecord::Base.transaction do
      first_item.update!(status: "Voided", void_reason: reason)
      MrfItem.where(po_code: po_code).update_all(win_loss: nil, po_code: nil, pdf_url: nil)
    end
    render json: "PO #{po_code} voided successfully. Items have been returned to the Canvassing pool."
  end

  private

  def signature_data_uri(user)
    return nil unless user.signature.attached?
    "data:#{user.signature.content_type};base64,#{Base64.strict_encode64(user.signature.download)}"
  end
end
