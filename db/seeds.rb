# Fresh-database seeds: admin login, role → allowed-tabs permission matrix,
# and the default expense list. Tab tokens must match the data-permission
# attributes in the ported index.html nav.
ALL_TABS = [
  "admin", "boq", "expense", "site engineer", "record petty cash",
  "project engineer", "subcontractor", "subcontractor reports",
  "material requests", "payments", "petty cash ledger", "boq-adjust",
  "compute project cost", "supplier data", "issue payments",
  "refundable expenses", "rtb-approvals"
].freeze

{
  "admin" => ALL_TABS,
  "accountant" => [
    "payments", "expense", "petty cash ledger", "boq-adjust",
    "compute project cost", "supplier data", "issue payments",
    "refundable expenses", "rtb-approvals"
  ],
  "approver" => ["material requests"],
  "site engineer" => ["site engineer", "record petty cash"],
  "project engineer" => ["project engineer"],
  "encoder" => ["boq", "expense"],
  "subcontractor" => ["subcontractor", "subcontractor reports"]
}.each do |role, tabs|
  RolePermission.find_or_create_by!(role: role) do |rp|
    rp.allowed_tabs = tabs.join(",")
  end
end

User.find_or_create_by!(email: "admin@vegastar.local") do |u|
  u.name = "Administrator"
  u.role = "admin"
  u.password = "ChangeMe123!"
end

["Labor", "Material"].each do |type|
  ExpenseListEntry.find_or_create_by!(expense_type: type, item_name: nil)
end

# One ready-made login per role so every permission set can be verified
# by hand (see docs/UAT-TEST-GUIDE.md in the workspace root).
{
  "accountant"       => "accountant@vegastar.local",
  "approver"         => "approver@vegastar.local",
  "site engineer"    => "site.engineer@vegastar.local",
  "project engineer" => "project.engineer@vegastar.local",
  "encoder"          => "encoder@vegastar.local",
  "subcontractor"    => "subcontractor@vegastar.local"
}.each do |role, email|
  User.find_or_create_by!(email: email) do |u|
    u.name = "Test #{role.split.map(&:capitalize).join(' ')}"
    u.role = role
    u.password = "Test123!"
  end
end
