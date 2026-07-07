class Api::AuthController < Api::BaseController
  skip_before_action :require_login!
  before_action :require_login!, only: [:get_my_signature, :upload_signature]

  # Port of verifyLogin(inputEmail, inputPassword) — Source/code.js:2496
  def verify_login
    email = args[0].to_s.downcase.strip
    password = args[1].to_s

    if email.blank? || password.blank?
      return render json: { authorized: false, message: "Email and password are required." }
    end

    user = User.find_by(email: email)
    return render json: { authorized: false, message: "Email not found in the system." } unless user

    unless user.authenticate(password)
      return render json: { authorized: false, message: "Incorrect password." }
    end

    session[:user_id] = user.id
    allowed = user.allowed_tabs.presence&.split(",")&.map { |t| t.strip.downcase } || []
    render json: { authorized: true, email: user.email, name: user.name,
                   role: user.role, allowedTabs: allowed }
  end

  # Port of handleForgotPassword(inputEmail) — Source/code.js:2539
  def handle_forgot_password
    email = args[0].to_s.downcase.strip
    return render json: "Please enter your email first." if email.blank?

    user = User.find_by(email: email)
    return render json: "Email not found in the system." unless user

    user.update!(reset_token: SecureRandom.uuid, reset_token_expires_at: 1.hour.from_now)
    begin
      AuthMailer.reset_password(user).deliver_now
      render json: "Success! A password reset link has been emailed to you."
    rescue => e
      render json: "Error sending email: #{e}"
    end
  end

  # Port of processPasswordReset(token, newPassword) — Source/code.js:2579
  def process_password_reset
    token = args[0].to_s
    return render json: { success: false, message: "Invalid reset token." } if token.blank?

    user = User.find_by(reset_token: token)
    unless user
      return render json: { success: false, message: "Invalid or expired reset token." }
    end
    if user.reset_token_expires_at.nil? || Time.current > user.reset_token_expires_at
      return render json: { success: false, message: "This reset link has expired. Please request a new one." }
    end

    user.update!(password: args[1].to_s, reset_token: nil, reset_token_expires_at: nil)
    render json: { success: true, message: "Password updated successfully! You can now log in." }
  end

  def logout
    session.delete(:user_id)
    render json: { success: true }
  end

  # The users.signature slot existed in the original design but had no UI;
  # these two endpoints back the "My Signature" button in the top bar. The
  # image is stamped onto dispatched PO PDFs (see PurchaseOrdersController).
  def get_my_signature
    render json: { url: signature_url(current_user) }
  end

  def upload_signature
    file = arg(0) || {}
    raise "Signature image is required." if file["data"].blank?
    raise "Signature must be an image file (PNG or JPG)." unless file["mimeType"].to_s.start_with?("image/")

    ext = File.extname(file["name"].to_s).presence || ".png"
    current_user.signature.attach(
      io: StringIO.new(Base64.decode64(file["data"].to_s)),
      filename: "signature_user#{current_user.id}#{ext}",
      content_type: file["mimeType"].to_s
    )
    render json: { url: signature_url(current_user.reload) }
  end

  private

  def signature_url(user)
    return nil unless user.signature.attached?
    Rails.application.routes.url_helpers.rails_blob_path(
      user.signature, disposition: "inline", only_path: true
    )
  end
end
