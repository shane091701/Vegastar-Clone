# Backs the "Assign Company" dropdowns in the BOQ upload screens (previously
# a hardcoded <option> list in index.html.erb -- Krone Konstruct, Vegastar,
# CT -- meaning adding a new one meant editing code, not something an admin
# could do). Listing is open to anyone logged in (both dropdowns are used by
# non-admin roles too); editing the list is admin-only.
class Api::CompaniesController < Api::BaseController
  before_action :require_admin!, only: [:create_company, :update_company, :delete_company]

  def get_companies_list
    render json: { companies: AssignCompany.order(:name).pluck(:name) }
  end

  def create_company
    name = args[0].to_s.strip
    raise "Company name is required." if name.blank?
    raise "That company already exists." if AssignCompany.where("LOWER(name) = ?", name.downcase).exists?

    AssignCompany.create!(name: name)
    render json: { companies: AssignCompany.order(:name).pluck(:name) }
  end

  def update_company
    old_name = args[0].to_s
    new_name = args[1].to_s.strip
    raise "New company name is required." if new_name.blank?

    company = AssignCompany.find_by(name: old_name)
    raise "Company not found." unless company
    if AssignCompany.where("LOWER(name) = ?", new_name.downcase).where.not(id: company.id).exists?
      raise "Another company already uses this name."
    end

    company.update!(name: new_name)
    render json: { companies: AssignCompany.order(:name).pluck(:name) }
  end

  def delete_company
    company = AssignCompany.find_by(name: args[0].to_s)
    raise "Company not found." unless company
    company.destroy!
    render json: { companies: AssignCompany.order(:name).pluck(:name) }
  end

  private

  def require_admin!
    render json: { error: "Admins only." }, status: :forbidden unless current_user.role.to_s.downcase == "admin"
  end
end
