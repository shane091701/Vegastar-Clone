require "test_helper"

class Api::CompaniesControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: RolePermission::ALL_TABS.join(","))
    RolePermission.create!(role: "encoder", allowed_tabs: "boq,expense")
    @admin = User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    @encoder = User.create!(name: "Enc", email: "enc@test.local", role: "encoder", password: "Secret123!")
    AssignCompany.create!(name: "Vegastar")
    AssignCompany.create!(name: "CT")
  end

  test "any logged-in user can list companies" do
    post "/api/verifyLogin", params: { args: ["enc@test.local", "Secret123!"] }, as: :json
    post "/api/getCompaniesList", params: { args: [] }, as: :json
    assert_response :success
    assert_equal ["CT", "Vegastar"], JSON.parse(response.body)["companies"]
  end

  test "non-admin cannot create a company" do
    post "/api/verifyLogin", params: { args: ["enc@test.local", "Secret123!"] }, as: :json
    post "/api/createCompany", params: { args: ["Krone Konstruct"] }, as: :json
    assert_response :forbidden
  end

  test "admin can create a company" do
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    post "/api/createCompany", params: { args: ["Krone Konstruct"] }, as: :json
    assert_response :success
    assert_equal ["CT", "Krone Konstruct", "Vegastar"], JSON.parse(response.body)["companies"]
  end

  test "admin cannot create a duplicate company (case-insensitive)" do
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    post "/api/createCompany", params: { args: ["vegastar"] }, as: :json
    assert_response :unprocessable_entity
    assert_equal "That company already exists.", JSON.parse(response.body)["error"]
  end

  test "admin can rename a company" do
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    post "/api/updateCompany", params: { args: ["CT", "CT Builders"] }, as: :json
    assert_response :success
    assert_equal ["CT Builders", "Vegastar"], JSON.parse(response.body)["companies"]
  end

  test "admin can delete a company" do
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
    post "/api/deleteCompany", params: { args: ["CT"] }, as: :json
    assert_response :success
    assert_equal ["Vegastar"], JSON.parse(response.body)["companies"]
  end
end
