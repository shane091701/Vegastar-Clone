# Port of sendPendingChecksEmail() — Source/code.js:4561. Schedule daily
# (8-9 AM) via Windows Task Scheduler:
#   schtasks /Create /SC DAILY /ST 08:00 /TN "VegastarChecksReminder" ^
#     /TR "cmd /c cd /d C:\Users\Shane\Desktop\SP Bedana\vegastar-erp && bin\rails checks:send_reminders"
namespace :checks do
  desc "Email accounting/admin users a digest of Not Deposited checks due today or overdue"
  task send_reminders: :environment do
    today = Date.current
    due_checks = Check.where(status: "Not Deposited").where.not(check_date: nil)
                      .where(check_date: ..today).order(:check_date).map do |c|
      overdue_days = (today - c.check_date).to_i
      {
        date: c.check_date.strftime("%b %d, %Y"),
        project: c.project_name.to_s.strip,
        bank: c.bank.to_s.strip,
        checkNumber: c.check_number.to_s.strip,
        amount: c.amount.to_f,
        statusLabel: overdue_days.zero? ? "Due Today" : "Overdue #{overdue_days}d",
        statusColor: overdue_days.zero? ? "#16a34a" : "#dc2626"
      }
    end

    if due_checks.empty?
      puts "No checks due or overdue. No email sent."
      next
    end

    recipients = User.where("LOWER(role) IN (?)", ["accounting", "accountant", "admin"]).pluck(:email)
    if recipients.empty?
      puts "No accounting/admin recipients found."
      next
    end

    ChecksMailer.pending_digest(recipients, due_checks, today.strftime("%B %d, %Y")).deliver_now
    puts "Sent digest of #{due_checks.length} check(s) to #{recipients.join(', ')}."
  end
end
