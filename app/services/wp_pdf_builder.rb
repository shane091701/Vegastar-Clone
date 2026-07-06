# Port of generateWorkPackagePdf_(wpId) HTML — Source/code.js:6515-6610.
class WpPdfBuilder
  def self.html(work_package)
    wp_code = work_package.wp_code
    date_str = Time.current.strftime("%B %d, %Y")
    sec_hdr = "font-size:12px;text-transform:uppercase;color:#555;border-bottom:2px solid #e8a820;padding-bottom:4px;margin:20px 0 10px;font-weight:bold;"

    lines = WpBoqLine.where(wp_code: wp_code).order(:id)
    boq_rows = if lines.any?
      lines.map do |l|
        "<tr>" \
          %(<td style="border:1px solid #ddd;padding:8px;">#{h(l.phase)} / #{h(l.scope)}</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;">#{h(l.item)}</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:right;">#{fmt(l.boq_cost)}</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:right;">#{fmt(l.allocated_cost)}</td>) \
          "</tr>"
      end.join
    else
      %(<tr><td colspan="4" style="text-align:center;padding:8px;color:#999;">No BOQ lines assigned.</td></tr>)
    end

    milestones = SubconMilestone.where(wp_code: wp_code).order(:seq, :id)
    mil_rows = if milestones.any?
      milestones.map do |m|
        "<tr>" \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:center;">#{m.seq}</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;">#{h(m.label)}</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:center;">#{pct(m.target_pct)}%</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:center;">#{pct(m.payment_pct)}%</td>) \
          %(<td style="border:1px solid #ddd;padding:8px;text-align:right;">#{fmt(m.amount)}</td>) \
          "</tr>"
      end.join
    else
      %(<tr><td colspan="5" style="text-align:center;padding:8px;color:#999;">No milestones defined.</td></tr>)
    end

    <<~HTML
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
        #{PdfGenerator.logo_header_html("Work Package")}
        <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">
          <tr><td style="width:150px;color:#666;padding:4px 0;"><strong>WP ID</strong></td><td>#{h(wp_code)}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Project</strong></td><td>#{h(work_package.project_code)}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Subcontractor</strong></td><td>#{h(work_package.subcontractor_name)}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Label</strong></td><td>#{h(work_package.label)}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Basis</strong></td><td>#{work_package.budget_basis.presence ? h(work_package.budget_basis) : "&mdash;"}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Contract Value</strong></td><td style="font-weight:700;color:#1d3461;">#{fmt(work_package.contract_value)}</td></tr>
          <tr><td style="color:#666;padding:4px 0;"><strong>Date</strong></td><td>#{date_str}</td></tr>
        </table>
        <h3 style="#{sec_hdr}">Claimed BOQ Lines</h3>
        <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:20px;">
          <thead><tr style="background-color:#f2f2f2;">
            <th style="border:1px solid #ddd;padding:8px;text-align:left;">Phase / Scope</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left;">Item</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">BOQ Cost</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">Allocated Incurred</th>
          </tr></thead>
          <tbody>#{boq_rows}</tbody>
        </table>
        <h3 style="#{sec_hdr}">Milestone Schedule</h3>
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead><tr style="background-color:#f2f2f2;">
            <th style="border:1px solid #ddd;padding:8px;text-align:center;">Seq</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left;">Label</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:center;">Target %</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:center;">Payment %</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>#{mil_rows}</tbody>
        </table>
        <div style="margin-top:40px;text-align:center;font-size:11px;color:#777;">This is a computer-generated document.</div>
      </div>
    HTML
  end

  def self.h(text)
    ERB::Util.html_escape(text.to_s)
  end

  def self.fmt(n)
    PdfGenerator.fmt_currency(n)
  end

  def self.pct(p)
    f = p.to_f
    f == f.to_i ? f.to_i : f
  end
end
