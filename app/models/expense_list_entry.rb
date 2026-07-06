class ExpenseListEntry < ApplicationRecord
  validates :expense_type, presence: true
end
