class Delivery < ApplicationRecord
  has_one_attached :receipt
  has_many_attached :photos
end
