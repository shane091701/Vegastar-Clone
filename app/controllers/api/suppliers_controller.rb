class Api::SuppliersController < Api::BaseController
  # Port of saveSupplierData(payload, userEmail) — code.js:4095
  def save_supplier_data
    payload = arg(0) || {}
    Supplier.create!(
      company_name: payload["name"], contact_person: payload["contact"],
      email: payload["email"], phone: payload["phone"], tin: payload["tin"],
      category: payload["category"], address: payload["address"],
      bank_details: payload["bank"], encoder_email: current_user.email
    )
    render json: "Success"
  end

  # Port of getSuppliersList() — code.js:4112
  def get_suppliers_list
    rows = Supplier.order(:id).map do |s|
      { name: s.company_name, contact: s.contact_person, email: s.email,
        phone: s.phone, tin: s.tin, category: s.category,
        address: s.address, bank: s.bank_details }
    end
    render json: rows.reverse
  end
end
