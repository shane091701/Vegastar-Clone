class Api::PettyCashController < Api::BaseController
  # Port of submitPettyCashRecord(payload, userEmail) — code.js:37
  def submit_petty_cash_record
    payload = arg(0) || {}
    encoder = (args[1].presence || current_user.email).to_s
    file = payload["file"] || {}
    raise "Failed to save Petty Cash record: receipt file is required." if file["data"].blank?

    type_count = Reimbursement.where(project_code: payload["project"],
                                     expense_type: payload["expenseType"]).count
    sequence = (type_count + 1).to_s.rjust(2, "0")
    extension = File.extname(file["name"].to_s)
    safe_type = payload["expenseType"].to_s.gsub(/[^a-zA-Z0-9 -]/, "").strip.gsub(/\s+/, "_")
    new_file_name = "Petty_Cash_#{safe_type}_#{sequence}#{extension}"

    record = Reimbursement.new(
      project_code: payload["project"], expense_type: payload["expenseType"],
      particulars: payload["particulars"], amount: payload["amount"],
      encoder_email: encoder
    )
    record.receipt.attach(io: StringIO.new(Base64.decode64(file["data"].to_s)),
                          filename: new_file_name, content_type: file["mimeType"].to_s)
    record.save!
    record.update!(receipt_url: Rails.application.routes.url_helpers.rails_blob_path(
      record.reload.receipt, disposition: "inline", only_path: true
    ))
    render json: "Success"
  rescue ActiveRecord::RecordInvalid => e
    raise "Failed to save Petty Cash record: #{e.message}"
  end

  # Port of getPCLedgerData() — code.js:119
  def get_pc_ledger_data
    records = []
    projects = Set.new
    submitters = Set.new
    types = Set.new

    Reimbursement.order(:id).each do |r|
      next if r.project_code.blank?
      submitter = r.encoder_email.present? ? r.encoder_email.split("@").first : "Unknown"
      projects << r.project_code
      submitters << submitter
      types << r.expense_type

      records << {
        rawDate: r.created_at.to_i * 1000,
        date: r.created_at.strftime("%Y-%m-%d"),
        project: r.project_code,
        type: r.expense_type,
        particulars: r.particulars,
        amount: r.amount.to_f,
        fileUrl: r.receipt_url.to_s,
        submitter: submitter
      }
    end

    BoqItem.where.not(project_code: [nil, ""]).distinct.pluck(:project_code)
           .each { |p| projects << p }

    render json: {
      records: records.sort_by { |r| -r[:rawDate] },
      projects: projects.to_a.sort,
      submitters: submitters.to_a.sort,
      types: types.to_a.sort
    }
  end
end
