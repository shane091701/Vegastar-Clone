class Api::ReceivingController < Api::BaseController
  # Port of getReceivingData() — code.js:2950
  def get_receiving_data
    po_project_map = {}
    MrfItem.order(:id).each do |m|
      po_code = m.po_code.to_s.strip
      project = m.project_code.to_s.strip
      po_project_map[po_code] = project if po_code.present? && project.present?
    end

    delivered_map = Hash.new(0.0)
    Delivery.find_each do |d|
      delivered_map["#{d.po_number.to_s.strip}|#{d.item_name.to_s.strip}"] += d.quantity.to_f
    end

    projects = Set.new
    pos = {}
    PurchaseOrderItem.order(:id).each do |p|
      po_code = p.po_number.to_s.strip
      item_name = p.item_name.to_s.strip
      ordered = p.quantity.to_f
      received = delivered_map["#{po_code}|#{item_name}"]
      remaining = ordered - received
      next unless remaining > 0

      project = po_project_map[po_code] || "Unassigned"
      projects << project
      pos[project] ||= {}
      pos[project][po_code] ||= []
      pos[project][po_code] << {
        name: item_name, brand: p.brand.to_s.strip,
        ordered: ordered, received: received, remaining: remaining
      }
    end

    render json: { projects: projects.to_a.sort, pos: pos }
  end

  # Port of submitReceivingToBackend(payload) — code.js:3383
  def submit_receiving_to_backend
    payload = arg(0) || {}
    date = Time.current

    receipt_url = ""
    photo_url = ""
    attach_records = []

    (payload["items"] || []).each_with_index do |item, idx|
      delivery = Delivery.new(
        received_date: date,
        delivery_doc_number: payload["docNum"].to_s,
        receiver_email: (payload["email"].presence || current_user.email).to_s,
        item_name: item["name"], quantity: item["qty"],
        po_number: payload["poCode"].to_s,
        remarks: item["remarks"].to_s
      )
      # Files attach to the first delivery row; URL string mirrors the original
      # "Receipt: <url> \nPhoto: <url>" format the client parses.
      if idx.zero?
        if payload["receiptFile"].present?
          f = payload["receiptFile"]
          delivery.receipt.attach(io: StringIO.new(Base64.decode64(f["data"].to_s)),
                                  filename: "#{payload['project']}_Delivery_Receipt#{File.extname(f['name'].to_s)}",
                                  content_type: f["mimeType"].to_s)
        end
        if payload["photoFile"].present?
          f = payload["photoFile"]
          delivery.photos.attach(io: StringIO.new(Base64.decode64(f["data"].to_s)),
                                 filename: "#{payload['project']}_Item_Photos#{File.extname(f['name'].to_s)}",
                                 content_type: f["mimeType"].to_s)
        end
      end
      delivery.save!
      attach_records << delivery

      if idx.zero?
        url_helpers = Rails.application.routes.url_helpers
        receipt_url = url_helpers.rails_blob_path(delivery.receipt, disposition: "inline", only_path: true) if delivery.receipt.attached?
        photo_url = url_helpers.rails_blob_path(delivery.photos.first, disposition: "inline", only_path: true) if delivery.photos.attached?
      end
    end

    combined =
      if receipt_url.present? && photo_url.present?
        "Receipt: #{receipt_url} \nPhoto: #{photo_url}"
      elsif receipt_url.present?
        "Receipt: #{receipt_url}"
      elsif photo_url.present?
        "Photo: #{photo_url}"
      else
        ""
      end
    attach_records.each { |d| d.update!(url_pictures: combined) }

    render json: "Success"
  end

  # Port of getReceivingHistoryData() — code.js:4067
  def get_receiving_history_data
    history = Delivery.order(:id).map do |d|
      {
        date: d.received_date&.strftime("%b %d, %Y %H:%M"),
        docNum: d.delivery_doc_number,
        receiver: d.receiver_email.present? ? d.receiver_email.split("@").first : "Unknown",
        item: d.item_name, qty: d.quantity.to_f, poCode: d.po_number,
        urls: d.url_pictures.to_s, remarks: d.remarks.to_s,
        rawTimestamp: d.received_date.to_i * 1000
      }
    end
    render json: history.sort_by { |h| -h[:rawTimestamp] }
  end
end
