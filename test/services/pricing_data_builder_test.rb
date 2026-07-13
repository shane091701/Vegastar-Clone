require "test_helper"

class PricingDataBuilderTest < ActiveSupport::TestCase
  test "does not double-count an expense type whose catalog already has a literal Miscellaneous entry" do
    ExpenseListEntry.create!(expense_type: "Site Overhead", item_name: "Miscellaneous")
    Expense.create!(project_code: "PRJ1", expense_type: "Site Overhead",
                    particular: "Miscellaneous", total_amount: 5_000)

    data = PricingDataBuilder.call("PRJ1")
    grp = data["Site Overhead"]

    misc_lines = grp["lineItems"].select { |li| li["name"] == "Miscellaneous" }
    assert_equal 1, misc_lines.length,
      "there must be exactly one Miscellaneous line item, not one from the catalog plus a duplicate placeholder"
    assert_equal 5_000.0, grp["amount"],
      "the group total must count the Miscellaneous expense once, not twice"
  end

  test "still adds a Miscellaneous placeholder when the catalog has no such entry" do
    ExpenseListEntry.create!(expense_type: "Permits", item_name: "Building Permit")

    data = PricingDataBuilder.call("PRJ1")
    grp = data["Permits"]

    assert_equal ["Building Permit", "Miscellaneous"], grp["lineItems"].map { |li| li["name"] }
  end
end
