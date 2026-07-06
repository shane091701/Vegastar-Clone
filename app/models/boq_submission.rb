class BoqSubmission < ApplicationRecord
  has_one_attached :pdf
  validates :submission_code, presence: true, uniqueness: true
end
