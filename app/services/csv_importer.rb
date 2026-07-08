require "csv"

# Generic engine behind the "Import Data (CSV)" admin screen. Each per-type
# importer in Api::CsvImportController declares which column names it
# accepts (normalized: lowercased, spaces/punctuation stripped) and this
# turns the raw uploaded CSV text into an array of { line:, data: {} }.
module CsvImporter
  BOM = "\xEF\xBB\xBF".freeze

  def self.parse(csv_text, column_aliases:, required: [])
    text = csv_text.to_s
    text = text.delete_prefix(BOM) if text.start_with?(BOM)
    text = text.strip
    raise "The file is empty." if text.blank?

    table = begin
      CSV.parse(text, headers: true, skip_blanks: true)
    rescue CSV::MalformedCSVError => e
      raise "Could not read that file as CSV: #{e.message}"
    end
    raise "The file has no header row." if table.headers.nil?

    field_for_index = {}
    table.headers.each_with_index do |header, i|
      key = normalize(header)
      next if key.blank?
      canonical = column_aliases.find { |_, aliases| aliases.include?(key) }&.first
      field_for_index[i] = canonical if canonical
    end

    missing = required - field_for_index.values
    if missing.any?
      raise "Missing required column(s): #{missing.join(', ')}. Download the template to see the expected headers."
    end

    table.each_with_index.map do |row, i|
      data = {}
      field_for_index.each { |idx, field| data[field] = row[idx].to_s.strip }
      { line: i + 2, data: data } # +2 = 1-indexed + header row
    end
  end

  def self.normalize(header)
    header.to_s.strip.downcase.gsub(/[^a-z0-9]/, "")
  end

  def self.to_number(val)
    s = val.to_s.gsub(",", "").strip
    return nil if s.blank?
    Float(s)
  rescue ArgumentError
    nil
  end

  def self.parse_date(val)
    s = val.to_s.strip
    return nil if s.blank?
    Date.parse(s)
  rescue ArgumentError, TypeError
    nil
  end
end
