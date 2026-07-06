class RtbLog < ApplicationRecord
  validates :percent_to_bill, numericality: { greater_than: 0, less_than_or_equal_to: 100 }, allow_nil: true
end
