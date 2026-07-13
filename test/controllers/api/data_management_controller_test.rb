require "test_helper"

class Api::DataManagementControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    JSON.parse(response.body)
  end

  test "a project with no attached data can be viewed and deleted" do
    project = Project.create!(code: "STUCK PROJECT", customer_name: "Someone")

    rows = api("getManagedRows", "projects")
    assert_response :success
    assert(rows["rows"].any? { |r| r["code"] == "STUCK PROJECT" })

    api("deleteManagedRow", "projects", project.id)
    assert_response :success
    refute Project.exists?(project.id)
  end

  test "a project with BOQ items cannot be deleted" do
    project = Project.create!(code: "PRJ1")
    BoqItem.create!(project_code: "PRJ1", item: "Cement", qty: 10, uom: "bags")

    post "/api/deleteManagedRow", params: { args: ["projects", project.id] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/BOQ items/, JSON.parse(response.body)["error"])
    assert Project.exists?(project.id)
  end

  test "a project with MRF requests cannot be deleted" do
    project = Project.create!(code: "PRJ2")
    MrfItem.create!(project_code: "PRJ2", item: "Cement", mrf_code: "MRF-PRJ2-1", status: "Pending")

    post "/api/deleteManagedRow", params: { args: ["projects", project.id] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/MRF requests/, JSON.parse(response.body)["error"])
  end

  # Suppliers no longer have their own "Manage Data" screen entry (edit/delete
  # moved to Accounting -> Supplier Data, see portal.js), but they still go
  # through these same generic endpoints -- lock that in.
  test "a supplier can be listed, edited, and deleted via the generic managed-row endpoints" do
    supplier = Supplier.create!(company_name: "ACME Corp", contact_person: "Jane Doe", email: "jane@acme.test")

    rows = api("getManagedRows", "suppliers")
    assert_response :success
    assert(rows["rows"].any? { |r| r["company_name"] == "ACME Corp" && r["id"] == supplier.id })

    api("updateManagedRow", "suppliers", supplier.id, { "company_name" => "ACME Corporation" })
    assert_response :success
    assert_equal "ACME Corporation", supplier.reload.company_name

    api("deleteManagedRow", "suppliers", supplier.id)
    assert_response :success
    refute Supplier.exists?(supplier.id)
  end
end
