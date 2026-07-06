# Port of writeNativeBoqToLogs_(payload) — Source/code.js:4890. Writes an
# approved native BOQ into boq_items using the same column mapping the Excel
# ingestor uses (quoted cost lands in the Col F slot, per-unit labor/material
# in the Col I/J slots — matching the original sheet writes exactly).
class NativeBoqWriter
  def self.call(payload)
    project = payload["project"] || {}
    items = payload["items"] || []
    project_code = project["code"].to_s.strip.gsub(/\s+/, " ")
    company = project["company"].to_s.strip
    timestamp = Time.current

    rows = items.map do |item|
      qty = item["qty"].to_f
      labor = item["laborCost"].to_f
      material = item["materialCost"].to_f
      total = item["totalCost"].to_f.nonzero? || (labor + material) * qty
      quoted = item["quotedCost"].to_f.nonzero? || total * 1.35

      {
        phase: item["phase"].to_s.strip,
        item: item["name"].to_s.strip,
        qty: qty,
        uom: item["unit"].to_s.strip,
        unit_material_cost: quoted,
        total_labor: labor,
        total_material: material,
        total_cost: total,
        project_code: project_code,
        source_file: "Native BOQ",
        entry_date: timestamp,
        scope: item["scope"].to_s.strip,
        company: company,
        created_at: timestamp,
        updated_at: timestamp
      }
    end

    ActiveRecord::Base.transaction do
      BoqItem.insert_all!(rows) if rows.any?
      BoqIngestor.save_customer_info(project_code, {
        "name" => project["customerName"].to_s,
        "phone" => project["phone"].to_s,
        "email" => project["email"].to_s,
        "site" => project["site"].to_s,
        "billing" => project["billing"].to_s,
        "birthday" => project["birthday"].to_s,
        "tin" => project["tin"].to_s,
        "company" => company,
        "quotedCost" => project["quotedCost"],
        "milestoneTerms" => project["milestoneTerms"]
      })
    end
    rows.length
  end
end
