class SubconAudit < ApplicationRecord
  def self.log!(entity, entity_code, action, detail, user_email)
    create!(entity: entity, entity_code: entity_code, action: action,
            detail: detail, user_email: user_email.presence || "SYSTEM")
  rescue => e
    Rails.logger.error("SubconAudit.log! failed: #{e.message}")
  end
end
