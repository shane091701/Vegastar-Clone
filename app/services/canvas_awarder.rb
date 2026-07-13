# Port of awardCanvasWinners(mrfId, winners, userEmail) — Source/code.js:1980.
# One PO per winning supplier; lot items (qty 0) become qty 1; the encoded
# amount is the subtotal and unit price is back-calculated for delivery math.
class CanvasAwarder
  def self.call(mrf_code:, winners:, user:)
    date = Time.current
    brand_lookup = {}
    SupplierQuote.where(mrf_code: mrf_code).each do |q|
      brand_lookup["#{q.item.to_s.strip}|#{q.supplier.to_s.strip}"] = q.brand.to_s
    end

    groups = winners.group_by { |w| w["supplier"].to_s }
    generated = 0

    groups.each do |supplier, items|
      po_code = "#{SequencedCode.next_po_code}-#{SecureRandom.alphanumeric(3).upcase}"
      representative = nil

      ActiveRecord::Base.transaction do
        items.each do |it|
          calc_qty = it["qty"].to_f.zero? ? 1.0 : it["qty"].to_f
          subtotal = it["amount"].to_f
          unit_price = subtotal / calc_qty
          brand = brand_lookup["#{it['item'].to_s.strip}|#{supplier.strip}"] || ""

          PurchaseOrderItem.create!(
            order_date: date, po_number: po_code, supplier: supplier,
            item_name: it["item"], unit: "Unit", quantity: calc_qty,
            unit_price: unit_price, status: "Draft", void_reason: "",
            brand: brand, mrf_code: mrf_code
          )

          MrfItem.where(mrf_code: mrf_code)
                 .where("LOWER(TRIM(item)) = ?", it["item"].to_s.strip.downcase)
                 .each do |m|
            m.update!(win_loss: "Win", po_code: po_code, request_amount: subtotal)
            representative = m
          end
        end
      end

      # The PurchaseOrderItem/MrfItem updates above already committed for
      # this supplier -- a PDF failure here must not raise, or every
      # remaining supplier in `groups` (this loop) never gets processed at
      # all, with no indication that this supplier partially succeeded.
      if representative
        begin
          pdf_url = PdfGenerator.store(
            doc_type: "po", reference_code: po_code,
            html: PoPdfBuilder.html(po_code: po_code, project: representative.project_code,
                                    supplier: supplier, mrf_code: mrf_code),
            file_name: "#{po_code}.pdf"
          )
          MrfItem.where(po_code: po_code).update_all(pdf_url: pdf_url)
        rescue => e
          Rails.logger.error("awardCanvasWinners PO PDF generation failed for #{po_code}: #{e.message}")
        end
      end
      generated += 1
    end

    "Successfully generated #{generated} Purchase Orders!"
  end
end
