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
  # On a real (production) deployment the default password is publicly known
  # from the docs, so force the very first login to set a new one. In dev/test
  # we leave it usable directly so local work and the test suite aren't disrupted.
  u.must_change_password = Rails.env.production?
end

["Labor", "Material"].each do |type|
  ExpenseListEntry.find_or_create_by!(expense_type: type, item_name: nil)
end

# One ready-made login per role so every permission set can be verified by
# hand (see UAT-TEST-GUIDE.md). These have known passwords, so they are
# seeded ONLY outside production -- never ship them to a public deployment.
unless Rails.env.production?
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
end
