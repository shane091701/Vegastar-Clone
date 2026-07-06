class SubconMilestone < ApplicationRecord
  belongs_to :work_package, foreign_key: :wp_code, primary_key: :wp_code, optional: true
  validates :milestone_code, presence: true, uniqueness: true
end
