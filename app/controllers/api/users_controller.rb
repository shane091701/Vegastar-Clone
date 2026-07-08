# Backs the "Manage Users" admin screen (app/assets/javascripts/manage_users.js).
# The original system had no account-creation screen either -- accounts only
# ever came from db:seed -- so this closes a real operational gap: an admin
# needs a way to onboard a new login without touching the terminal.
class Api::UsersController < Api::BaseController
  before_action :require_admin!

  def get_users_list
    users = User.order(:id).map do |u|
      { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at.strftime("%b %d, %Y") }
    end
    render json: { users: users, roles: RolePermission.order(:role).pluck(:role) }
  end

  def create_user
    payload = arg(0) || {}
    name = payload["name"].to_s.strip
    email = payload["email"].to_s.strip.downcase
    role = payload["role"].to_s.strip
    password = payload["password"].to_s

    raise "Name is required." if name.blank?
    raise "Email is required." if email.blank?
    raise "Please choose a role." if role.blank?
    raise "Unknown role: #{role}" unless RolePermission.where("LOWER(role) = ?", role.downcase).exists?
    raise "Password must be at least 8 characters." if password.length < 8
    raise "An account with this email already exists." if User.where(email: email).exists?

    user = User.create!(name: name, email: email, role: role, password: password)
    render json: { id: user.id, name: user.name, email: user.email, role: user.role,
                   createdAt: user.created_at.strftime("%b %d, %Y") }
  end

  def deactivate_user
    user = User.find_by(id: args[0])
    raise "User not found." unless user
    raise "You can't deactivate your own account while logged in as it." if user.id == current_user.id

    # Matches the rest of the app's convention of leaving history intact
    # (voided POs, retired subcontractors) rather than hard-deleting.
    user.update!(email: "disabled+#{user.id}_#{user.email}", password: SecureRandom.hex(16))
    render json: { success: true }
  end

  private

  def require_admin!
    render json: { error: "Admins only." }, status: :forbidden unless current_user.role.to_s.downcase == "admin"
  end
end
