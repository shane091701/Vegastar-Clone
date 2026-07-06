# Generates the document control codes used across the system, preserving the
# exact formats of the original Apps Script implementation (see Source/code.js:
# buildMrfCode_/getNextProjectNumber_, generatePoCode_, etc.).
module SequencedCode
  # MRF codes are sequenced per project: "MRF-<PROJECTCODE_NO_HYPHENS>-<n>"
  def self.next_mrf_code(project_code)
    proj = project_code.to_s
    max = MrfItem.where(project_code: proj).distinct.pluck(:mrf_code)
                 .map { |code| extract_mrf_number(code, proj) }.max || 0
    "MRF-#{proj.gsub('-', '')}-#{max + 1}"
  end

  def self.extract_mrf_number(code, project_code)
    return 0 if code.blank?
    ["MRF-#{project_code.to_s.gsub('-', '')}-", "MRF-#{project_code}-"].each do |prefix|
      return code.delete_prefix(prefix).to_i if code.start_with?(prefix)
    end
    0
  end

  # Port of generatePoCode_ — code.js:2066. Counts existing codes containing
  # today's prefix across mrf_items.po_code and purchase_order_items.po_number
  # (the awarder appends a random 3-char suffix on top of this base).
  def self.next_po_code(date = Date.current)
    prefix = "PO-#{date.strftime('%m%d%y')}"
    count = MrfItem.where("po_code LIKE ?", "%#{sanitize_like(prefix)}%").count +
            PurchaseOrderItem.where("po_number LIKE ?", "%#{sanitize_like(prefix)}%").count
    "#{prefix}-#{(count + 1).to_s.rjust(3, '0')}"
  end

  def self.next_boq_submission_code(date = Date.current)
    next_in_series(BoqSubmission, :submission_code, "BOQ-#{date.strftime('%Y%m%d')}-", 3)
  end

  def self.next_rtb_code(project_code)
    next_in_series(RtbLog, :rtb_code, "RTB-#{project_code}-", 3)
  end

  def self.next_sub_code
    next_in_series(Subcontractor, :sub_code, "SUB-", 5)
  end

  def self.next_wp_code
    next_in_series(WorkPackage, :wp_code, "WP-", 5)
  end

  def self.next_milestone_code
    next_in_series(SubconMilestone, :milestone_code, "MIL-", 5)
  end

  def self.next_report_code
    next_in_series(SubconReport, :report_code, "RPT-", 5)
  end

  def self.next_in_series(model, column, prefix, digits)
    max = model.where("#{column} LIKE ?", "#{sanitize_like(prefix)}%")
               .pluck(column)
               .map { |code| code.to_s.delete_prefix(prefix).to_i }
               .max || 0
    "#{prefix}#{format("%0#{digits}d", max + 1)}"
  end

  def self.sanitize_like(str)
    ActiveRecord::Base.sanitize_sql_like(str)
  end
end
