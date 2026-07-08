# Backs the "Manage Users" admin screen (app/assets/javascripts/manage_users.js).
# The original system had no account-creation screen either -- accounts only
# ever came from db:seed -- so this closes a real operational gap: an admin
# needs a way to onboard, edit, reset, and offboard logins without touching
# the terminal.
class Api::UsersController < Api::BaseController
  before_action :require_admin!

  def get_users_list
    users = User.order(:id).map do |u|
      { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
        createdAt: u.created_at.strftime("%b %d, %Y") }
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

    # A password the admin just typed in is, by definition, known to at
    # least one other person -- always force a change on first login.
    user = User.create!(name: name, email: email, role: role, password: password,
                        must_change_password: true)
    render json: serialize(user)
  end

  # Edits name / email / role of an existing account. Deliberately doesn't
  # touch the password -- use reset_password for that.
  def update_user
    user = User.find_by(id: args[0])
    raise "User not found." unless user

    payload = arg(1) || {}
    name = payload["name"].to_s.strip
    email = payload["email"].to_s.strip.downcase
    role = payload["role"].to_s.strip

    raise "Name is required." if name.blank?
    raise "Email is required." if email.blank?
    raise "Please choose a role." if role.blank?
    raise "Unknown role: #{role}" unless RolePermission.where("LOWER(role) = ?", role.downcase).exists?
    raise "Another account already uses this email." if User.where(email: email).where.not(id: user.id).exists?

    user.update!(name: name, email: email, role: role)
    render json: serialize(user)
  end

  # Sets a fresh temporary password for someone who's genuinely locked out
  # (can't self-serve via "Forgot password" either) -- forces them to pick
  # their own on next login, same as a brand-new account.
  def reset_password
    user = User.find_by(id: args[0])
    raise "User not found." unless user
    new_password = args[1].to_s
    raise "Password must be at least 8 characters." if new_password.length < 8

    user.update!(password: new_password, must_change_password: true)
    render json: { success: true }
  end

  def deactivate_user
    user = User.find_by(id: args[0])
    raise "User not found." unless user
    raise "You can't deactivate your own account while logged in as it." if user.id == current_user.id

    user.update!(active: false)
    render json: serialize(user)
  end

  def reactivate_user
    user = User.find_by(id: args[0])
    raise "User not found." unless user

    user.update!(active: true)
    render json: serialize(user)
  end

  private

  def serialize(user)
    { id: user.id, name: user.name, email: user.email, role: user.role,
      active: user.active, createdAt: user.created_at.strftime("%b %d, %Y") }
  end

  def require_admin!
    render json: { error: "Admins only." }, status: :forbidden unless current_user.role.to_s.downcase == "admin"
  end
end
