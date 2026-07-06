# Port of createPoPdf_(poCode, rowData, signerData) — Source/code.js:2256.
class PoPdfBuilder
  def self.html(po_code:, project:, supplier:, mrf_code:, signer: nil)
    items = PurchaseOrderItem.where(po_number: po_code).order(:id)
    date_str = Time.current.strftime("%B %d, %Y")
    grand_total = 0.0

    items_html = items.map do |item|
      line_total = item.quantity.to_f * item.unit_price.to_f
      grand_total += line_total
      brand = item.brand.presence || "N/A"
      <<~ROW
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">#{h(item.item_name)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">#{h(brand)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">#{fmt_qty(item.quantity.to_f)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">#{PdfGenerator.fmt_currency(line_total)}</td>
        </tr>
      ROW
    end.join

    signature_html = ""
    if signer
      img_tag = if signer[:base64Image].present?
        %(<img src="#{signer[:base64Image]}" style="max-height: 80px; position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: -1;">)
      else
        %(<div style="height: 80px;"></div>)
      end
      signature_html = <<~SIG
        <div style="margin-top: 60px; width: 300px;">
          <div style="position: relative; text-align: center;">
            #{img_tag}
            <div style="border-bottom: 1px solid #333; margin-bottom: 5px; height: 80px;"></div>
            <strong>#{h(signer[:name])}</strong><br>
            <span style="font-size: 12px; color: #555;">Authorized Approver</span>
          </div>
        </div>
      SIG
    end

    <<~HTML
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
        #{PdfGenerator.logo_header_html("Purchase Order")}
        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:18px; font-weight:bold; color:#1d3461;">#{h(project)}</div>
          <div style="font-size:14px; color:#555; margin-top:2px;">#{h(po_code)}</div>
        </div>
        <table style="width: 100%; margin-bottom: 30px;">
          <tr>
            <td style="width: 50%;">
              <strong>PO #:</strong> #{h(po_code)}<br>
              <strong>Date:</strong> #{date_str}
            </td>
            <td style="width: 50%; text-align: right;">
              <strong>Supplier:</strong> #{h(supplier)}<br>
              <strong>Ref MRF:</strong> #{h(mrf_code)}
            </td>
          </tr>
        </table>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: left;">Item Name</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Brand</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Qty</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>#{items_html}</tbody>
        </table>
        <div style="text-align: right; font-size: 18px;">
          <strong>GRAND TOTAL: &nbsp;&nbsp;&nbsp; <span style="font-size: 22px;">#{PdfGenerator.fmt_currency(grand_total)}</span></strong>
        </div>
        #{signature_html}
        <div style="margin-top: 60px; text-align: center; font-size: 12px; color: #777;">
          This is a computer-generated document.
        </div>
      </div>
    HTML
  end

  def self.h(text)
    ERB::Util.html_escape(text.to_s)
  end

  def self.fmt_qty(qty)
    qty == qty.to_i ? qty.to_i.to_s : qty.to_s
  end
end
