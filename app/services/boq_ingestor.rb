# Port of processBOQ / uploadFile_ / processData_ / findBOQSheet_ from
# Source/code.js:2640-2857. Parses an uploaded BOQ Excel file and writes
# project + boq_items rows. Return values are the exact strings the client
# displays.
require "roo"
require "spreadsheet"

class BoqIngestor
  TARGET_SHEET_PATTERNS = ["AR BOM", "DETAILED", "BOQ", "BILL OF QUANTITIES", "BOM", "BILL OF MATERIALS"].freeze
  QTY_HEADERS = ["QTY", "QTY.", "QUANTITY"].freeze
  PHASE_PREFIX = /\A([a-zA-Z0-9IVXLCDM]+\.\s*)/
  PHASE_ROW = /\A([a-zA-Z0-9IVXLCDM]+\.)?\s*[A-Za-z]/
  TOP_LEVEL_SECTION_ROW = /\A\d+\.0\z/
  SCOPE_ROW = /\A\d+\.\d+\z/

  # Two known real-world column layouts, selected by which column the QTY/QUANTITY
  # header cell is found in. Column indices are 0-based.
  LAYOUTS_BY_QTY_COLUMN = {
    2 => { # existing "simple" layout -- ITEM,DESCRIPTION,QTY,UNIT,U/C MAT,TOTAL MAT,U/C LABOR,TOTAL LABOR,TOTAL
      phase_col: 0, item_col: 1, qty_col: 2, uom_col: 3,
      unit_material_col: 4, total_material_col: 5,
      unit_labor_col: 6, total_labor_col: 7, total_col: 8
    }.freeze,
    4 => { # "detailed breakdown" layout -- verified against the real client BOM file
      phase_col: 1, item_col: 2, qty_col: 4, uom_col: 5,
      unit_material_col: 6, total_material_col: 7,
      unit_labor_col: 8, total_labor_col: 9, total_col: 11
    }.freeze
  }.freeze

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
    layout = nil
    raw_data.each_with_index do |row, i|
      qty_col_idx = row.each_index.find { |idx| QTY_HEADERS.include?(normalize_header(row[idx])) }
      next unless qty_col_idx

      layout = LAYOUTS_BY_QTY_COLUMN[qty_col_idx]
      unless layout
        raise "Unrecognized column layout in sheet #{sheet_name} -- found a QTY/QUANTITY " \
              "header in column index #{qty_col_idx}, but only column 2 or column 4 are " \
              "recognized layouts."
      end
      header_row_idx = i
      break
    end
    unless header_row_idx
      raise "Could not find a 'QTY'/'QUANTITY' header cell anywhere in sheet #{sheet_name} " \
            "to use as the header anchor."
    end

    current_phase = ""
    current_scope = ""
    timestamp = Time.current
    new_items = []

    raw_data.each_with_index do |row, i|
      next if i <= header_row_idx
      next if row.all? { |c| c.to_s.strip.empty? }

      col_phase = cell(row, layout[:phase_col])
      col_item  = cell(row, layout[:item_col])
      col_qty   = cell(row, layout[:qty_col])
      # Excel stores markers like "1.0"/"2.0" as genuine numbers, not text, when the
      # source column is otherwise numeric-looking -- `cell()`'s whole-number-Float
      # rounding (needed elsewhere for clean qty/cost display) would silently turn
      # "1.0" into "1" and break TOP_LEVEL_SECTION_ROW/SCOPE_ROW matching, so
      # classification uses the unrounded raw text instead.
      phase_marker = raw_cell_text(row, layout[:phase_col])

      if phase_marker.match?(TOP_LEVEL_SECTION_ROW) && col_qty.empty?
        current_phase = col_item
        current_scope = ""
        next
      end

      if phase_marker.match?(PHASE_ROW) && col_qty.empty? && !phase_marker.match?(SCOPE_ROW)
        current_phase = col_phase.sub(PHASE_PREFIX, "").strip
        current_scope = ""
        next
      end

      if phase_marker.match?(SCOPE_ROW) && col_qty.empty?
        current_scope = col_item
        next
      end

      next if col_item.upcase.include?("TOTAL") || col_item.upcase.include?("SUB-TOTAL")

      qty = clean_number(col_qty)
      if !col_item.empty? && !col_qty.empty? && qty
        new_items << {
          phase: current_phase.presence || "Uncategorized Phase",
          item: col_item,
          qty: qty,
          uom: cell(row, layout[:uom_col]),
          unit_labor_cost: clean_number(row[layout[:unit_labor_col]]),
          unit_material_cost: clean_number(row[layout[:unit_material_col]]),
          total_labor: clean_number(row[layout[:total_labor_col]]),
          total_material: clean_number(row[layout[:total_material_col]]),
          total_cost: clean_number(row[layout[:total_col]]),
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
      if ext == "xls"
        return read_legacy_xls(f.path)
      else
        return read_roo_workbook(f.path, ext)
      end
    end
  end

  def self.read_roo_workbook(path, ext)
    workbook = Roo::Spreadsheet.open(path, extension: ext.to_sym)
    sheet_name = find_boq_sheet_name(workbook)
    sheet = workbook.sheet(sheet_name)
    rows = (1..(sheet.last_row || 0)).map { |r| sheet.row(r).map { |v| resolve_cell_value(v) } }
    [sheet_name, rows]
  end

  def self.read_legacy_xls(path)
    workbook = Spreadsheet.open(path)
    sheet_name = find_boq_sheet_name_legacy(workbook)
    sheet = workbook.worksheet(sheet_name)
    rows = (0...sheet.row_count).map do |r|
      row = sheet.row(r)
      (0...sheet.column_count).map { |c| resolve_cell_value(row[c]) }
    end
    # The `spreadsheet` gem keeps its own open file handle on the underlying OLE2
    # document alive until the Workbook object is garbage collected -- on Windows
    # (unlike Linux/Railway) an open file can't be deleted, so without this, the
    # caller's Tempfile cleanup raises Errno::EACCES right after this method
    # returns, even though parsing itself succeeded. Verified fix during design:
    # dropping the reference and forcing a GC pass here releases the handle before
    # the caller's Tempfile.create block tries to unlink the file.
    sheet = nil
    workbook = nil
    GC.start
    [sheet_name, rows]
  end

  def self.find_boq_sheet_name(workbook)
    workbook.sheets.each do |name|
      up = name.upcase
      next if up.include?("SUM")
      return name if TARGET_SHEET_PATTERNS.any? { |p| up.include?(p) }
    end
    workbook.sheets.first
  end

  def self.find_boq_sheet_name_legacy(workbook)
    names = workbook.worksheets.map(&:name)
    names.each do |name|
      up = name.upcase
      next if up.include?("SUM")
      return name if TARGET_SHEET_PATTERNS.any? { |p| up.include?(p) }
    end
    names.first
  end

  # Both `roo` (.xlsx/.xlsm/.ods/.csv) and `spreadsheet` (.xls) can hand back a
  # formula wrapper instead of a plain value for computed cells -- normalize
  # to the cached calculated result either way so downstream parsing never
  # has to know which library produced a given row.
  def self.resolve_cell_value(v)
    v.respond_to?(:value) ? v.value : v
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

  # Like `cell`, but without the whole-number-Float-to-Integer rounding -- used where
  # a value's exact decimal form matters (phase/scope marker classification), since
  # Excel can store markers like "1.0" as a genuine number rather than text, and
  # rounding it to "1" would break matching against a pattern like \A\d+\.0\z.
  def self.raw_cell_text(row, idx)
    row[idx].to_s.strip
  end

  # Strips internal whitespace in addition to the usual strip+upcase, so header cells
  # using letter-spacing for visual effect (e.g. "D E S C R I P T I O N", seen in the
  # real client file) still match plain keywords like "DESCRIPTION" or "QTY".
  def self.normalize_header(val)
    val.to_s.strip.upcase.gsub(/\s+/, "")
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
