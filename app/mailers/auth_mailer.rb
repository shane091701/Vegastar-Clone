class AuthMailer < ApplicationMailer
  def reset_password(user)
    @user = user
    @reset_link = "#{root_url}?resetToken=#{user.reset_token}"
    mail(to: user.email, subject: "SP Bedana Portal - Password Reset Request")
  end
end
