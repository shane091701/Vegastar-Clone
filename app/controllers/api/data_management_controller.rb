# Backs the view / edit / delete grid on the "Manage Data" admin screen
# (app/assets/javascripts/csv_import.js). Operates on the same reference &
# historical data types the CSV importer loads -- see ManagedDataTypes for
# the field registry and per-type deletion guards.
class Api::DataManagementController < Api::BaseController
  before_action :require_admin!
  before_action :load_type!

  def get_managed_rows
    rows = @config[:model].order(id: :desc).map { |r| ManagedDataTypes.serialize(@type, r) }
    render json: { label: @config[:label], fields: @config[:fields], rows: rows }
  end

  def update_managed_row
    record = @config[:model].find_by(id: args[1])
    raise "Record not found." unless record

    data = arg(2) || {}
    attrs = ManagedDataTypes.attributes_from(@type, data)

    @config[:fields].each do |f|
      next unless f[:required]
      if ManagedDataTypes.blank?(attrs[f[:key]])
        raise "#{f[:label]} is required."
      end
    end

    if @type == "subcontractors"
      name = attrs["name"].to_s.strip
      if Subcontractor.where("LOWER(TRIM(name)) = ?", name.downcase).where.not(id: record.id).exists?
        raise "Another subcontractor named \"#{name}\" already exists."
      end
    end

    record.update!(attrs)
    render json: ManagedDataTypes.serialize(@type, record)
  end

  def delete_managed_row
    record = @config[:model].find_by(id: args[1])
    raise "Record not found." unless record

    blockers = ManagedDataTypes.deletion_blockers(@type, record)
    raise blockers.first if blockers.any?

    record.destroy!
    render json: { success: true }
  end

  private

  def load_type!
    @type = args[0].to_s
    @config = ManagedDataTypes.config(@type)
    raise "Unknown data type: #{@type}" unless @config
  end

  def require_admin!
    render json: { error: "Admins only." }, status: :forbidden unless current_user.role.to_s.downcase == "admin"
  end
end
