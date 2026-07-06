class Subcontractor < ApplicationRecord
  has_many :work_packages, foreign_key: :sub_code, primary_key: :sub_code
  validates :sub_code, presence: true, uniqueness: true
end
