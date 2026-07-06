class PurchaseOrderItem < ApplicationRecord
  validates :po_number, presence: true

  def subtotal
    (quantity || 0) * (unit_price || 0)
  end
end
