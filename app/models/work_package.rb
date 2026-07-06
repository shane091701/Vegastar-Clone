class WorkPackage < ApplicationRecord
  has_one_attached :contract_pdf
  has_one_attached :pdf
  has_many :wp_boq_lines, foreign_key: :wp_code, primary_key: :wp_code
  has_many :subcon_milestones, foreign_key: :wp_code, primary_key: :wp_code
  has_many :subcon_reports, foreign_key: :wp_code, primary_key: :wp_code
  belongs_to :subcontractor, foreign_key: :sub_code, primary_key: :sub_code, optional: true

  validates :wp_code, presence: true, uniqueness: true
end
