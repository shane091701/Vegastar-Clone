# Port of generateBoqApprovalPdf_ / generateApprovedBoqPdf_ HTML construction
# — Source/code.js:5145-5300. Builds the phase→scope→items outline document.
class BoqPdfBuilder
  def self.approval_html(submission_code, payload)
    build(submission_code, payload, "Bill of Quantities — For Approval")
  end

  def self.approved_html(submission_code, payload)
    build(submission_code, payload, "Bill of Quantities — Approved")
  end

  def self.build(submission_code, payload, title)
    proj = payload["project"] || {}
    items = payload["items"] || []
    date_str = Time.current.strftime("%B %d, %Y")

    grouped = {}
    phase_order = []
    items.each do |it|
      ph = (it["phase"].presence || "General").strip
      sc = (it["scope"].presence || "General").strip
      unless grouped.key?(ph)
        grouped[ph] = {}
        phase_order << ph
      end
      (grouped[ph][sc] ||= []) << it
    end

    grand_total = 0.0
    body = +""
    phase_order.each do |ph|
      body << %(<tr><td colspan="6" style="background:#1d3461;color:#fff;font-weight:bold;padding:8px 10px;text-transform:uppercase;font-size:11px;">#{h(ph)}</td></tr>)
      grouped[ph].keys.sort.each do |sc|
        body << %(<tr><td colspan="6" style="background:#f1f5f9;color:#475569;font-weight:600;padding:6px 10px 6px 18px;font-size:11px;">#{h(sc)}</td></tr>)
        grouped[ph][sc].each do |it|
          qty = it["qty"].to_f
          lab = it["laborCost"].to_f
          mat = it["materialCost"].to_f
          tot = it["totalCost"].to_f.nonzero? || (lab + mat) * qty
          grand_total += tot
          body << "<tr>" \
            %(<td style="border:1px solid #ddd;padding:6px 8px;">#{h(it["name"])}</td>) \
            %(<td style="border:1px solid #ddd;padding:6px 8px;text-align:center;">#{h(it["unit"])}</td>) \
            %(<td style="border:1px solid #ddd;padding:6px 8px;text-align:center;">#{fmt_qty(qty)}</td>) \
            %(<td style="border:1px solid #ddd;padding:6px 8px;text-align:right;">#{fmt(lab)}</td>) \
            %(<td style="border:1px solid #ddd;padding:6px 8px;text-align:right;">#{fmt(mat)}</td>) \
            %(<td style="border:1px solid #ddd;padding:6px 8px;text-align:right;font-weight:600;">#{fmt(tot)}</td>) \
            "</tr>"
        end
      end
    end

    <<~HTML
      <div style="font-family:Arial,sans-serif;padding:40px;color:#333;">
        #{PdfGenerator.logo_header_html(title)}
        <table style="width:100%;font-size:12px;margin-bottom:18px;border-collapse:collapse;">
          <tr><td style="width:150px;color:#666;padding:3px 0;"><b>Project Code</b></td><td>#{h(proj["code"])}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Customer</b></td><td>#{h(proj["customerName"])}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Company</b></td><td>#{h(proj["company"])}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Contact</b></td><td>#{h(proj["phone"])}#{proj["email"].present? ? " · #{h(proj["email"])}" : ""}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Site</b></td><td>#{h(proj["site"].presence || "—")}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>TIN</b></td><td>#{h(proj["tin"].presence || "—")}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Submission ID</b></td><td>#{h(submission_code)}</td></tr>
          <tr><td style="color:#666;padding:3px 0;"><b>Date</b></td><td>#{date_str}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="background:#f8f9fa;">
            <th style="border:1px solid #ddd;padding:8px;text-align:left;">Item</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:center;">UOM</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:center;">Qty</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">Labor</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">Material</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">Total Cost</th>
          </tr></thead>
          <tbody>#{body}</tbody>
        </table>
        <div style="text-align:right;font-size:16px;margin-top:20px;"><b>GRAND TOTAL: #{fmt(grand_total)}</b></div>
        <div style="margin-top:50px;text-align:center;font-size:11px;color:#777;">This is a computer-generated document for internal approval.</div>
      </div>
    HTML
  end

  def self.h(text)
    ERB::Util.html_escape(text.to_s)
  end

  def self.fmt(n)
    PdfGenerator.fmt_currency(n)
  end

  def self.fmt_qty(qty)
    qty == qty.to_i ? qty.to_i.to_s : qty.to_s
  end
end
