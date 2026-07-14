# Ports the daily pending-checks digest — Source/code.js:4561 (sendPendingChecksEmail).
class ChecksMailer < ApplicationMailer
  def pending_digest(recipients, due_checks, today_str)
    @due_checks = due_checks
    @today_str = today_str
    mail(to: recipients.first, bcc: recipients.drop(1),
         subject: "[Checks Due] #{due_checks.length} check(s) require deposit — SP Bedana")
  end
end
