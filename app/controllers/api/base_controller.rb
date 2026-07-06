class Api::BaseController < ApplicationController
  skip_before_action :verify_authenticity_token, raise: false
  before_action :require_login!

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def require_login!
    render json: { error: "Not authenticated" }, status: :unauthorized unless current_user
  end

  # The google.script.run shim posts {args: [...]} — positional arguments
  # exactly as the original client passed them.
  def args
    params.fetch(:args, [])
  end

  def arg(index)
    a = args[index]
    a.respond_to?(:to_unsafe_h) ? a.to_unsafe_h : a
  end

  rescue_from StandardError do |e|
    Rails.logger.error("#{e.class}: #{e.message}\n#{Array(e.backtrace).first(10).join("\n")}")
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
