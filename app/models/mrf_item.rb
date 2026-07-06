class MrfItem < ApplicationRecord
  has_one_attached :attachment
  validates :item, presence: true
end
