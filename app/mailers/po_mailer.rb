# Port of the dispatch email — Source/code.js:2210.
class PoMailer < ApplicationMailer
  def dispatch(to_email, po_code, supplier_name, project_name, signer_name, pdf_data)
    @po_code = po_code
    @supplier_name = supplier_name
    @project_name = project_name
    @signer_name = signer_name
    attachments["#{po_code}_Signed.pdf"] = pdf_data
    mail(to: to_email, subject: "Purchase Order [#{po_code}] - SP Bedana")
  end
end
