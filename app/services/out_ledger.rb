# Ports updateEntryInOut_ / removeEntryFromOut_ — Source/code.js:2909-2942.
# Both operate on the most recent ledger row for the composite control code
# ("<MRF code>-<item name>"), matching the original bottom-up sheet scan.
module OutLedger
  def self.update_entry(control_code, new_qty, unit)
    entry = OutLedgerEntry.where(control_code: control_code).order(:id).last
    return unless entry
    if unit.to_s.downcase == "lot"
      entry.update!(lot_amount: new_qty)
    else
      entry.update!(amount: new_qty)
    end
  end

  def self.remove_entry(control_code)
    OutLedgerEntry.where(control_code: control_code).order(:id).last&.destroy!
  end
end
