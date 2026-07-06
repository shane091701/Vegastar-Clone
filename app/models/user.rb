class User < ApplicationRecord
  has_secure_password
  has_one_attached :signature

  validates :email, presence: true, uniqueness: true
  validates :name, :role, presence: true

  before_validation { self.email = email.to_s.downcase.strip }

  def allowed_tabs
    RolePermission.where("LOWER(role) = ?", role.to_s.strip.downcase)
                  .pick(:allowed_tabs).to_s
  end
end
