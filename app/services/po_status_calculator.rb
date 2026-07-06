# Port of getPoStatus_(poCode, poItems, delData) — Source/code.js:2430.
class PoStatusCalculator
  def self.call(po_number)
    items = PurchaseOrderItem.where(po_number: po_number.to_s.strip).order(:id).to_a
    return "Pending receipt" if items.empty?

    base_status = items.first.status.to_s.strip.presence || "Sent"
    return base_status if ["Draft", "Voided"].include?(base_status)

    total_ordered = 0.0
    total_received = 0.0
    deliveries = Delivery.where(po_number: po_number.to_s.strip).to_a

    items.each do |item|
      total_ordered += item.quantity.to_f
      total_received += deliveries.select { |d| d.item_name == item.item_name }
                                  .sum { |d| d.quantity.to_f }
    end

    return "Sent" if total_received <= 0
    return "Received all" if total_received >= total_ordered
    "Partial delivery"
  end
end
