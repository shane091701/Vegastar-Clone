class Project < ApplicationRecord
  has_many :boq_items, foreign_key: :project_code, primary_key: :code
  has_many :expenses, foreign_key: :project_code, primary_key: :code
  has_many :mrf_items, foreign_key: :project_code, primary_key: :code
  has_many :rtb_logs, foreign_key: :project_code, primary_key: :code

  validates :code, presence: true, uniqueness: { case_sensitive: false }
end
