class BoqItem < ApplicationRecord
  validates :item, :project_code, presence: true
end
