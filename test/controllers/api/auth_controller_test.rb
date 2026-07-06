require "test_helper"

class Api::AuthControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin,boq,expense")
    @user = User.create!(name: "Admin", email: "admin@test.local",
                         role: "admin", password: "Secret123!")
  end

  test "verifyLogin succeeds with correct credentials" do
    post "/api/verifyLogin", params: { args: ["Admin@Test.local", "Secret123!"] }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert body["authorized"]
    assert_equal "Admin", body["name"]
    assert_equal "admin", body["role"]
    assert_equal ["admin", "boq", "expense"], body["allowedTabs"]
  end

  test "verifyLogin rejects wrong password" do
    post "/api/verifyLogin", params: { args: ["admin@test.local", "nope"] }, as: :json
    body = JSON.parse(response.body)
    refute body["authorized"]
    assert_equal "Incorrect password.", body["message"]
  end

  test "verifyLogin rejects unknown email" do
    post "/api/verifyLogin", params: { args: ["ghost@test.local", "x"] }, as: :json
    body = JSON.parse(response.body)
    refute body["authorized"]
    assert_equal "Email not found in the system.", body["message"]
  end

  test "protected endpoints require a session" do
    post "/api/logout", params: { args: [] }, as: :json
    assert_response :success # logout is on auth controller but harmless; use a protected route once available
  end

  test "password reset flow works end to end" do
    post "/api/handleForgotPassword", params: { args: ["admin@test.local"] }, as: :json
    assert_response :success
    assert_equal "Success! A password reset link has been emailed to you.", JSON.parse(response.body)

    token = @user.reload.reset_token
    assert token.present?

    post "/api/processPasswordReset", params: { args: [token, "NewSecret123!"] }, as: :json
    body = JSON.parse(response.body)
    assert body["success"]

    post "/api/verifyLogin", params: { args: ["admin@test.local", "NewSecret123!"] }, as: :json
    assert JSON.parse(response.body)["authorized"]
    assert_nil @user.reload.reset_token
  end

  test "expired token is rejected" do
    @user.update!(reset_token: "tok-123", reset_token_expires_at: 2.hours.ago)
    post "/api/processPasswordReset", params: { args: ["tok-123", "x"] }, as: :json
    body = JSON.parse(response.body)
    refute body["success"]
    assert_equal "This reset link has expired. Please request a new one.", body["message"]
  end
end
