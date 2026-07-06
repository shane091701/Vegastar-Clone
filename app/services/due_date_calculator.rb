# Ports getPoReceivedDate_ / parseTermDays_ / computeDueDate_ — Source/code.js:4132-4160.
module DueDateCalculator
  def self.po_received_date(po_code)
    Delivery.where(po_number: po_code.to_s.strip).minimum(:received_date)
  end

  def self.parse_term_days(term_text)
    m = term_text.to_s.match(/\d+/)
    m ? m[0].to_i : 0
  end

  def self.compute_due_date(base_date, term_text)
    return "" if base_date.nil?
    (base_date.to_date + parse_term_days(term_text).days).strftime("%Y-%m-%d")
  end
end
