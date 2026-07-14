# Shared registry for the "Manage Data" admin screen (view / edit / delete
# the reference & historical data types that also feed the CSV importer).
# Kept as a lookup method rather than a constant hash so model classes
# resolve through normal autoloading.
module ManagedDataTypes
  def self.config(type)
    all[type.to_s]
  end

  def self.all
    {
      "suppliers" => {
        model: Supplier, label: "Suppliers", label_field: "company_name",
        fields: [
          { key: "company_name", label: "Company Name", required: true },
          { key: "contact_person", label: "Contact Person" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "tin", label: "TIN" },
          { key: "category", label: "Category" },
          { key: "address", label: "Address" },
          { key: "bank_details", label: "Bank Details" }
        ]
      },
      "materials" => {
        model: Material, label: "Materials", label_field: "item_name",
        fields: [
          { key: "item_name", label: "Item Name", required: true },
          { key: "unit", label: "Unit" },
          { key: "actual_cost", label: "Actual Cost", type: "number" },
          { key: "quoted_cost", label: "Quoted Cost", type: "number" }
        ]
      },
      "subcontractors" => {
        model: Subcontractor, label: "Subcontractors", label_field: "name",
        fields: [
          { key: "sub_code", label: "Code", readonly: true },
          { key: "name", label: "Name", required: true },
          { key: "tin", label: "TIN" },
          { key: "contact", label: "Contact" }
        ]
      },
      "expense_categories" => {
        model: ExpenseListEntry, label: "Expense Categories", label_field: "expense_type",
        fields: [
          { key: "expense_type", label: "Type", required: true },
          { key: "item_name", label: "Item" }
        ]
      },
      "expenses" => {
        model: Expense, label: "Historical Expenses", label_field: "particular",
        fields: [
          { key: "entry_date", label: "Date", type: "date" },
          { key: "project_code", label: "Project", required: true },
          { key: "expense_type", label: "Type" },
          { key: "particular", label: "Particular" },
          { key: "total_amount", label: "Amount", type: "number", required: true }
        ]
      },
      "checks" => {
        model: Check, label: "Historical Checks", label_field: "check_number",
        fields: [
          { key: "check_date", label: "Date", type: "date" },
          { key: "project_name", label: "Project", required: true },
          { key: "bank", label: "Bank" },
          { key: "check_number", label: "Check Number", required: true },
          { key: "amount", label: "Amount", type: "number", required: true },
          { key: "status", label: "Status" }
        ]
      },
      "projects" => {
        model: Project, label: "Projects", label_field: "code",
        fields: [
          { key: "code", label: "Project Code", required: true },
          { key: "customer_name", label: "Customer Name" },
          { key: "company", label: "Company" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "site_location", label: "Site Location" }
        ]
      },
      "deliveries" => {
        model: Delivery, label: "Receiving / Deliveries", label_field: "item_name",
        fields: [
          { key: "received_date", label: "Date Received", type: "date" },
          { key: "delivery_doc_number", label: "Delivery Doc #" },
          { key: "po_number", label: "PO Number", required: true },
          { key: "item_name", label: "Item", required: true },
          { key: "quantity", label: "Quantity", type: "number", required: true },
          { key: "receiver_email", label: "Received By" },
          { key: "remarks", label: "Remarks" }
        ]
      },
      "reimbursements" => {
        model: Reimbursement, label: "Reimbursements / Petty Cash", label_field: "particulars",
        fields: [
          { key: "project_code", label: "Project", required: true },
          { key: "expense_type", label: "Expense Type" },
          { key: "particulars", label: "Particulars" },
          { key: "amount", label: "Amount", type: "number", required: true }
        ]
      }
    }
  end

  # Reasons a specific row can't be deleted because live app data still
  # points at it. Empty array = safe to delete.
  def self.deletion_blockers(type, record)
    case type.to_s
    when "subcontractors"
      if WorkPackage.where(sub_code: record.sub_code).exists?
        ["This subcontractor has work packages assigned. Deactivate it instead of deleting."]
      else
        []
      end
    when "checks"
      if SubconMilestone.where(check_number: record.check_number.to_s).where.not(check_number: [nil, ""]).exists?
        ["This check is linked to a subcontractor milestone. Unlink it first."]
      else
        []
      end
    when "projects"
      # Project isn't a real foreign key elsewhere -- other tables just carry
      # a matching project_code string (see docs/SP_BEDANA_ERP_MANUAL_FLOW.md).
      # Only let admins delete a project that has no real business data
      # attached (e.g. a stuck row left by a failed BOQ upload); a project
      # with actual history should never be silently deleted from here.
      code = record.code.to_s.strip
      blockers = []
      blockers << "This project has BOQ items." if BoqItem.where("LOWER(TRIM(project_code)) = ?", code.downcase).exists?
      blockers << "This project has MRF requests." if MrfItem.where("LOWER(TRIM(project_code)) = ?", code.downcase).exists?
      blockers << "This project has recorded expenses." if Expense.where("LOWER(TRIM(project_code)) = ?", code.downcase).exists?
      blockers << "This project has RTB records." if RtbLog.where("LOWER(TRIM(project_code)) = ?", code.downcase).exists?
      blockers << "This project has reimbursements." if Reimbursement.where("LOWER(TRIM(project_code)) = ?", code.downcase).exists?
      blockers
    else
      []
    end
  end

  # Human-readable identifier for audit-log entries (see DataAudit / the
  # "View History" action) -- e.g. a project's code, a supplier's name.
  def self.label_for(type, record)
    field = config(type)[:label_field]
    return "##{record.id}" unless field
    val = record.public_send(field).to_s.strip
    val.presence || "##{record.id}"
  end

  # Serialize a record into the flat { id:, <field>: value } shape the
  # management grid + edit modal expect. Dates come back as YYYY-MM-DD.
  def self.serialize(type, record)
    row = { "id" => record.id }
    config(type)[:fields].each do |f|
      val = record.public_send(f[:key])
      row[f[:key]] =
        if f[:type] == "date"
          val&.strftime("%Y-%m-%d")
        elsif f[:type] == "number"
          val.nil? ? nil : val.to_f
        else
          val
        end
    end
    row
  end

  # Turn incoming edit-form values into model attributes, honouring field
  # types and skipping readonly fields.
  def self.attributes_from(type, data)
    attrs = {}
    config(type)[:fields].each do |f|
      next if f[:readonly]
      key = f[:key]
      next unless data.key?(key)
      raw = data[key]
      attrs[key] =
        case f[:type]
        when "number" then CsvImporter.to_number(raw)
        when "date"   then CsvImporter.parse_date(raw)
        else raw.to_s
        end
    end
    attrs
  end

  def self.blank?(v)
    v.nil? || v.to_s.strip.empty?
  end
end
