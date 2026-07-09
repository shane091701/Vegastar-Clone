class RolePermission < ApplicationRecord
  validates :role, presence: true, uniqueness: true

  # Every tab token that can appear in a data-permission attribute in
  # app/views/portal/index.html.erb. Must stay in sync with db/seeds.rb's
  # ALL_TABS -- kept here too so the "Manage Users" role-permissions editor
  # has a fixed checklist to render.
  ALL_TABS = [
    "admin", "boq", "expense", "site engineer", "record petty cash",
    "project engineer", "subcontractor", "subcontractor reports",
    "material requests", "payments", "petty cash ledger", "boq-adjust",
    "compute project cost", "supplier data", "issue payments",
    "refundable expenses", "rtb-approvals"
  ].freeze
end
