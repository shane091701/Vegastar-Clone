class HiddenExpenseProject < ApplicationRecord
  validates :project_name, presence: true, uniqueness: true
end
