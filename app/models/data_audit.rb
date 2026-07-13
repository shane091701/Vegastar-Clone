# Audit trail for edits/deletes made through the generic "Manage Data"
# machinery (Api::DataManagementController) -- covers every ManagedDataTypes
# entry (Projects, Suppliers, Materials, Subcontractors, Expense Categories,
# Historical Expenses/Checks, Deliveries, Reimbursements). Not a general
# request log; only user-initiated edits/deletes of a managed row.
class DataAudit < ApplicationRecord
  def self.log!(entity_type:, action:, actor_email:, record_id: nil, entity_label: nil, detail: nil)
    create!(entity_type: entity_type, record_id: record_id, entity_label: entity_label,
            action: action, detail: detail, actor_email: actor_email.presence || "SYSTEM")
  rescue => e
    Rails.logger.error("DataAudit.log! failed: #{e.message}")
  end
end
