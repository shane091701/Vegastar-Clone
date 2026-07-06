class GeneratedPdf < ApplicationRecord
  has_one_attached :file
  validates :doc_type, :reference_code, presence: true

  def self.for(doc_type, reference_code)
    find_or_create_by!(doc_type: doc_type, reference_code: reference_code)
  end
end
