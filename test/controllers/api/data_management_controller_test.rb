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
end
