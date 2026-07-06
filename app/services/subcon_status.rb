# Ports buildChecksMap_ / getMilestoneStatus_ — Source/code.js:6132-6172.
module SubconStatus
  def self.checks_map
    map = {}
    Check.order(:id).each do |c|
      check_num = c.check_number.to_s.strip
      next if check_num.blank?
      status = c.status.to_s.strip
      map[check_num] = {
        checkNumber: check_num,
        project: c.project_name.to_s.strip,
        bank: c.bank.to_s.strip,
        amount: c.amount.to_f,
        date: c.check_date&.strftime("%b %-d, %Y").to_s,
        status: status,
        isVoided: status.downcase == "voided"
      }
    end
    map
  end

  def self.milestone_status(milestone, checks_map)
    check_id = milestone.check_number.to_s.strip
    if check_id.present?
      check = checks_map[check_id]
      return { status: "Paid", note: "" } if check && !check[:isVoided]
      note = check ? "prev. check ##{check_id} voided" : "check ##{check_id} not found"
      return { status: "Ready to Pay", note: note }
    end
    return { status: "Ready to Pay", note: "" } if milestone.ready_to_pay
    { status: "Open", note: "" }
  end
end
