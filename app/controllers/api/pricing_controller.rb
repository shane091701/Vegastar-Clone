class Api::PricingController < Api::BaseController
  # Port of getProjectPricingData(projectName) — code.js:3771
  def get_project_pricing_data
    render json: PricingDataBuilder.call(args[0].to_s)
  end

  # Port of savePricingSimulation(payload, userEmail) — code.js:3999
  def save_pricing_simulation
    payload = arg(0) || {}
    encoder = (args[1].presence || current_user.email).to_s

    ActiveRecord::Base.transaction do
      (payload["items"] || []).each do |item|
        PricingSimulation.create!(
          project_title: payload["project"], expense_type: item["type"],
          line_item: item["lineItem"], percentage: item["percentage"].to_f,
          override_amount: item["override"].presence, encoder_email: encoder
        )
      end
    end
    render json: "Pricing simulation snapshot saved successfully!"
  end
end
