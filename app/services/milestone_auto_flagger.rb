# Port of autoFlagMilestones_(wpId, percentComplete, reportId, ss) — Source/code.js:5944.
class MilestoneAutoFlagger
  def self.call(wp_code:, percent_complete:, report_code:)
    flagged_ids = []
    flagged_details = []

    SubconMilestone.where(wp_code: wp_code).order(:id).each do |mil|
      next if mil.ready_to_pay
      next if mil.check_number.to_s.strip.present?
      next if mil.target_pct.to_f > percent_complete

      mil.update!(ready_to_pay: true)
      SubconAudit.log!("Milestone", mil.milestone_code, "auto-flag",
                       "Milestone #{mil.milestone_code} (seq #{mil.seq}) flagged via Report #{report_code} at #{percent_complete}%",
                       "SYSTEM")
      flagged_ids << mil.milestone_code
      flagged_details << { milId: mil.milestone_code, seq: mil.seq,
                           label: mil.label.to_s, amount: mil.amount.to_f }
    end

    { flaggedMilIds: flagged_ids, flaggedDetails: flagged_details }
  end
end
