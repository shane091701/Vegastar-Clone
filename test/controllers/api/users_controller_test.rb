require "test_helper"

class Api::UsersControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: RolePermission::ALL_TABS.join(","))
    RolePermission.create!(role: "encoder", allowed_tabs: "boq,expense")
    @admin = User.create!(name: "Admin", email: "admin@test.local",
                          role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  test "getRolePermissions returns every role's tabs plus the full tab list" do
    post "/api/getRolePermissions", params: { args: [] }, as: :json
    assert_response :success
    body = JSON.parse(response.body)

    encoder = body["roles"].find { |r| r["role"] == "encoder" }
    assert_equal ["boq", "expense"], encoder["tabs"]
    assert_equal RolePermission::ALL_TABS, body["allTabs"]
  end

  test "updateRolePermissions changes a non-admin role's tabs" do
    post "/api/updateRolePermissions", params: { args: ["encoder", ["boq"]] }, as: :json
    assert_response :success
    assert_equal ["boq"], JSON.parse(response.body)["tabs"]
    assert_equal "boq", RolePermission.find_by(role: "encoder").allowed_tabs
  end

  test "updateRolePermissions refuses to change the admin role" do
    post "/api/updateRolePermissions", params: { args: ["admin", ["boq"]] }, as: :json
    assert_response :unprocessable_entity
    assert_equal "The admin role's access can't be changed.", JSON.parse(response.body)["error"]
  end

  test "updateRolePermissions rejects an unknown tab" do
    post "/api/updateRolePermissions", params: { args: ["encoder", ["not-a-real-tab"]] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Unknown tab/, JSON.parse(response.body)["error"])
  end

  test "updateRolePermissions rejects an unknown role" do
    post "/api/updateRolePermissions", params: { args: ["ghost-role", ["boq"]] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/Unknown role/, JSON.parse(response.body)["error"])
  end
end
