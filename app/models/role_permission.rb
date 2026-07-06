class RolePermission < ApplicationRecord
  validates :role, presence: true, uniqueness: true
end
