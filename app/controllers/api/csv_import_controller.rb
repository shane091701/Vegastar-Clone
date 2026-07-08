# Backs the "Import Data (CSV)" admin screen (app/assets/javascripts/csv_import.js).
# Covers exactly the data types that have no dedicated entry screen anywhere
# else in the app (Materials catalog), plus the ones that only support
# one-row-at-a-time entry (Suppliers, Subcontractors, Expense Categories) or
# would be tedious to retype from old records (historical Expenses/Checks).
class Api::CsvImportController < Api::BaseController
  IMPORTERS = %w[suppliers materials subcontractors expense_categories expenses checks].freeze

  def import_data
    type = args[0].to_s
    csv_text = args[1].to_s
    encoder = (args[2].presence || current_user.email).to_s
    raise "Unknown import type: #{type}" unless IMPORTERS.include?(type)
    raise "No file content received." if csv_text.blank?

    render json: send("import_#{type}", csv_text, encoder)
  end

  private

  def import_suppliers(csv_text, encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        company_name: %w[name companyname supplier suppliername company],
        contact_person: %w[contact contactperson],
        email: %w[email],
        phone: %w[phone phonenumber],
        tin: %w[tin],
        category: %w[category],
        address: %w[address],
        bank_details: %w[bank bankdetails]
      },
      required: [:company_name])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      name = d[:company_name].to_s.strip
      if name.blank?
        skipped << "Row #{r[:line]}: Company Name is blank"
        next
      end
      Supplier.create!(company_name: name, contact_person: d[:contact_person], email: d[:email],
        phone: d[:phone], tin: d[:tin], category: d[:category], address: d[:address],
        bank_details: d[:bank_details], encoder_email: encoder)
      created += 1
    end
    { created: created, skipped: skipped }
  end

  def import_materials(csv_text, _encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        item_name: %w[name itemname material materialname item],
        unit: %w[unit uom],
        actual_cost: %w[actualcost cost],
        quoted_cost: %w[quotedcost quoted]
      },
      required: [:item_name])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      name = d[:item_name].to_s.strip
      if name.blank?
        skipped << "Row #{r[:line]}: Item Name is blank"
        next
      end
      Material.create!(item_name: name, unit: d[:unit],
        actual_cost: CsvImporter.to_number(d[:actual_cost]),
        quoted_cost: CsvImporter.to_number(d[:quoted_cost]))
      created += 1
    end
    { created: created, skipped: skipped }
  end

  # Mirrors the duplicate-name guard in Api::SubcontractorsController#save_subcontractor
  # (Subcontractor itself has no uniqueness validation on :name -- only :sub_code).
  def import_subcontractors(csv_text, encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        name: %w[name subcontractorname subname],
        tin: %w[tin],
        contact: %w[contact contactnumber phone]
      },
      required: [:name])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      name = d[:name].to_s.strip
      if name.blank?
        skipped << "Row #{r[:line]}: Name is blank"
        next
      end
      if Subcontractor.where("LOWER(TRIM(name)) = ?", name.downcase).exists?
        skipped << "Row #{r[:line]}: \"#{name}\" already exists"
        next
      end
      sub = Subcontractor.create!(sub_code: SequencedCode.next_sub_code, name: name,
        tin: d[:tin].to_s, contact: d[:contact].to_s, active: true, created_by: encoder)
      SubconAudit.log!("Subcontractor", sub.sub_code, "create", "Created via CSV import: #{name}", encoder)
      created += 1
    end
    { created: created, skipped: skipped }
  end

  def import_expense_categories(csv_text, _encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        expense_type: %w[type expensetype category],
        item_name: %w[item itemname name particular]
      },
      required: [:expense_type])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      type = d[:expense_type].to_s.strip
      item = d[:item_name].to_s.strip
      if type.blank?
        skipped << "Row #{r[:line]}: Type is blank"
        next
      end
      if ExpenseListEntry.where(expense_type: type, item_name: item.presence).exists?
        skipped << "Row #{r[:line]}: \"#{type} / #{item}\" already exists"
        next
      end
      ExpenseListEntry.create!(expense_type: type, item_name: item.presence)
      created += 1
    end
    { created: created, skipped: skipped }
  end

  def import_expenses(csv_text, encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        project: %w[project projectcode],
        type: %w[type expensetype],
        particular: %w[particular description item],
        amount: %w[amount totalamount],
        date: %w[date entrydate]
      },
      required: %i[project amount])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      project = d[:project].to_s.strip
      amount = CsvImporter.to_number(d[:amount])
      if project.blank? || amount.nil?
        skipped << "Row #{r[:line]}: Project and a valid Amount are required"
        next
      end
      Expense.create!(entry_date: CsvImporter.parse_date(d[:date]) || Time.current,
        project_code: project, expense_type: d[:type].presence || "Material",
        particular: d[:particular], total_amount: amount, encoder_email: encoder)
      created += 1
    end
    { created: created, skipped: skipped }
  end

  def import_checks(csv_text, encoder)
    rows = CsvImporter.parse(csv_text,
      column_aliases: {
        date: %w[date checkdate],
        project: %w[project projectname],
        bank: %w[bank],
        check_number: %w[checknumber checknum checkno],
        amount: %w[amount],
        status: %w[status]
      },
      required: %i[project check_number amount])

    created = 0
    skipped = []
    rows.each do |r|
      d = r[:data]
      amount = CsvImporter.to_number(d[:amount])
      if d[:project].to_s.strip.blank? || d[:check_number].to_s.strip.blank? || amount.nil?
        skipped << "Row #{r[:line]}: Project, Check Number, and a valid Amount are required"
        next
      end
      Check.create!(check_date: CsvImporter.parse_date(d[:date]), project_name: d[:project],
        bank: d[:bank], check_number: d[:check_number], amount: amount,
        encoded_by: encoder, encode_date: Time.current, status: d[:status].presence || "Not Deposited")
      created += 1
    end
    { created: created, skipped: skipped }
  end
end
