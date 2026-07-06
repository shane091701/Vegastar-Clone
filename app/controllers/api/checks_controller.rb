class Api::ChecksController < Api::BaseController
  # Port of logBulkPaymentData(submissions, encoderEmail) — code.js:3096
  def log_bulk_payment_data
    submissions = args[0] || []
    encoder = (args[1].presence || current_user.email).to_s
    encode_date = Time.current

    ActiveRecord::Base.transaction do
      submissions.each do |p|
        Check.create!(check_date: (Date.parse(p["date"].to_s) rescue nil),
                      project_name: p["project"], bank: p["bank"],
                      check_number: p["checkNum"], amount: p["amount"],
                      encoded_by: encoder, encode_date: encode_date,
                      status: "Not Deposited")
      end
    end
    render json: "Success"
  rescue => e
    raise "Failed to save payments: #{e.message}"
  end

  # Port of getPendingChecks() — code.js:4474 (earliest due date first)
  def get_pending_checks
    pending = Check.where(status: "Not Deposited").where.not(check_date: nil)
                   .order(:check_date, :id).map do |c|
      {
        rowIdx: c.id,
        date: c.check_date.strftime("%Y-%m-%d"),
        sortTimestamp: c.check_date.to_time.to_i * 1000,
        project: c.project_name.to_s.strip,
        bank: c.bank.to_s.strip,
        checkNumber: c.check_number.to_s.strip,
        amount: c.amount.to_f
      }
    end
    render json: pending
  end

  # Port of updateCheckStatus(rowIndices, newStatus) — code.js:4531
  def update_check_status
    Check.where(id: args[0] || []).update_all(status: args[1].to_s)
    render json: true
  rescue => e
    Rails.logger.error("updateCheckStatus: #{e.message}")
    render json: false
  end
end
