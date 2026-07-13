# Port of processBOQ / uploadFile_ / processData_ / findBOQSheet_ from
# Source/code.js:2640-2857. Parses an uploaded BOQ Excel file and writes
# project + boq_items rows. Return values are the exact strings the client
# displays.
require "roo"

class BoqIngestor
  TARGET_SHEET_PATTERNS = ["AR BOM", "DETAILED", "BOQ", "BILL OF QUANTITIES", "BOM", "BILL OF MATERIALS"].freeze
  QTY_HEADERS = ["QTY", "QTY.", "QUANTITY"].freeze
  PHASE_PREFIX = /\A([a-zA-Z0-9IVXLCDM]+\.\s*)/
  PHASE_ROW = /\A([a-zA-Z0-9IVXLCDM]+\.)?\s*[A-Za-z]/
  SCOPE_ROW = /\A\d+\.\d+/

  def self.call(base64_data:, file_name:, project_code:, customer_data:)
    clean_code = project_code.to_s.strip.gsub(/\s+/, " ")
    unless clean_code.match?(/\A[A-Za-z0-9 ]+\z/)
      return "Error: Project Code may contain only letters, numbers, and spaces — no hyphens or symbols."
    end
    if project_code_exists?(clean_code)
      return "Error: Project Code '#{clean_code}' was already used. Please enter a unique code."
    end

    result = nil
    begin
      # Save + parse run in one transaction so a parse failure (or a parse
      # that finds nothing to import) can't leave a Project row behind with
      # no BOQ items -- that stuck row would block every future upload
      # attempt using the same project code with "already used".
      ActiveRecord::Base.transaction do
        save_customer_info(project_code.to_s, customer_data || {})
        sheet_name, rows = read_workbook(base64_data, file_name)
        result = ingest_rows(rows, sheet_name, project_code.to_s,
                             (customer_data || {})["company"].to_s, file_name)
        raise ActiveRecord::Rollback if result.start_with?("⚠️")
      end
      result
    rescue => e
      "Error in processBOQ: #{e}"
    end
  end

  # Parses raw cell rows (array of arrays, 0-based) exactly like processData_.
  def self.ingest_rows(raw_data, sheet_name, project_code, company, file_name)
    header_row_idx = nil
    raw_data.each_with_index do |row, i|
      col_c = cell(row, 2).upcase
      header_row_idx = i if QTY_HEADERS.include?(col_c)
    end
    unless header_row_idx
      raise "Could not find 'QTY' in Column C of sheet #{sheet_name} to use as the header anchor."
    end

    current_phase = ""
    current_scope = ""
    timestamp = Time.current
    new_items = []

    raw_data.each_with_index do |row, i|
      next if i <= header_row_idx
      next if row.all? { |c| c.to_s.strip.empty? }

      col_a = cell(row, 0)
      col_b = cell(row, 1)
      col_c = cell(row, 2)

      if col_a.match?(PHASE_ROW) && col_c.empty? && !col_a.match?(SCOPE_ROW)
        current_phase = col_a.sub(PHASE_PREFIX, "").strip
        current_scope = ""
        next
      end

      if col_a.match?(SCOPE_ROW) && col_c.empty?
        current_scope = col_b
        next
      end

      next if col_b.upcase.include?("TOTAL") || col_b.upcase.include?("SUB-TOTAL")

      if !col_b.empty? && !col_c.empty?
        new_items << {
          phase: current_phase.presence || "Uncategorized Phase",
          item: col_b,
          qty: clean_number(col_c),
          uom: cell(row, 3),
          unit_labor_cost: clean_number(row[6]),
          unit_material_cost: clean_number(row[4]),
          total_labor: clean_number(row[7]),
          total_material: clean_number(row[5]),
          total_cost: clean_number(row[8]),
          project_code: project_code.strip,
          source_file: file_name,
          entry_date: timestamp,
          scope: current_scope,
          company: company
        }
      end
    end

    if new_items.any?
      BoqItem.insert_all!(new_items.map { |it| it.merge(created_at: timestamp, updated_at: timestamp) })
      "✅ Successfully processed #{new_items.length} items from \"#{sheet_name}\" into the database."
    else
      "⚠️ No valid item rows found to process. Please check the Excel format."
    end
  end

  def self.read_workbook(base64_data, file_name)
    ext = File.extname(file_name.to_s).delete(".").downcase
    ext = "xlsx" if ext.empty?
    Tempfile.create(["boq", ".#{ext}"], binmode: true) do |f|
      f.write(Base64.decode64(base64_data))
      f.flush
      workbook = Roo::Spreadsheet.open(f.path, extension: ext.to_sym)
      sheet_name = find_boq_sheet_name(workbook)
      sheet = workbook.sheet(sheet_name)
      rows = (1..(sheet.last_row || 0)).map { |r| sheet.row(r) }
      return [sheet_name, rows]
    end
  end

  def self.find_boq_sheet_name(workbook)
    workbook.sheets.each do |name|
      up = name.upcase
      next if up.include?("SUM")
      return name if TARGET_SHEET_PATTERNS.any? { |p| up.include?(p) }
    end
    workbook.sheets.first
  end

  def self.save_customer_info(project_code, data)
    Project.create!(
      code: project_code,
      customer_name: data["name"].to_s,
      phone: data["phone"].to_s,
      email: data["email"].to_s,
      site_location: data["site"].to_s,
      billing_address: data["billing"].to_s,
      birthday: (Date.parse(data["birthday"].to_s) rescue nil),
      tin: data["tin"].to_s,
      company: data["company"].to_s,
      quoted_cost: numeric_or_nil(data["quotedCost"]),
      milestone_terms: data["milestoneTerms"] || []
    )
  end

  def self.project_code_exists?(code)
    target = code.to_s.strip.downcase
    return false if target.blank?
    Project.where("LOWER(TRIM(code)) = ?", target).exists? ||
      BoqItem.where("LOWER(TRIM(project_code)) = ?", target).exists?
  end

  def self.cell(row, idx)
    v = row[idx]
    v = v.to_i if v.is_a?(Float) && v == v.to_i
    v.to_s.strip
  end

  def self.clean_number(val)
    s = val.to_s.gsub(/[^0-9.\-]+/, "")
    return nil if s.blank?
    f = Float(s) rescue nil
    f&.round(2)
  end

  def self.numeric_or_nil(val)
    clean_number(val)
  end
end
