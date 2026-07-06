# Port of generateRfqPdf_ HTML construction — Source/code.js:1723.
class RfqPdfBuilder
  def self.html(request_id, items)
    date_str = Time.current.strftime("%B %d, %Y")
    items_html = items.map do |item|
      qty_display = item[:qty]
      unit_display = item[:unit]
      if item[:unit].to_s.downcase.include?("cost")
        qty_display = "1"
        unit_display = "Lot"
      end
      attachment = if item[:attachmentUrl].present?
        %(<a href="#{ERB::Util.html_escape(item[:attachmentUrl])}">View Attached Spec/Drawing</a>)
      else
        "N/A"
      end
      brand = item[:brand].to_s.strip.presence || "N/A"
      <<~ROW
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">#{ERB::Util.html_escape(item[:item])}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">#{ERB::Util.html_escape(qty_display.to_s)}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">#{ERB::Util.html_escape(unit_display.to_s)}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">#{ERB::Util.html_escape(brand)}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">#{attachment}</td>
        </tr>
      ROW
    end.join

    <<~HTML
      <html>
        <body style="font-family: sans-serif; color: #333; padding: 20px;">
          #{PdfGenerator.logo_header_html("Request for Quotation")}
          <p><strong>MRF Control #:</strong> #{ERB::Util.html_escape(request_id)}<br><strong>Date:</strong> #{date_str}</p>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Item Description</th>
                <th style="border: 1px solid #ddd; padding: 8px;">Qty</th>
                <th style="border: 1px solid #ddd; padding: 8px;">Unit</th>
                <th style="border: 1px solid #ddd; padding: 8px;">Brand</th>
                <th style="border: 1px solid #ddd; padding: 8px;">Attachment</th>
              </tr>
            </thead>
            <tbody>#{items_html}</tbody>
          </table>
          <p style="margin-top: 30px; font-size: 0.9em;">Please provide your best quotation for the items listed above.</p>
        </body>
      </html>
    HTML
  end
end
