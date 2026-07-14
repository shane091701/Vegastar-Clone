# Ports the MRF notification emails — Source/code.js:1070 (buildNewMrfEmail_)
# and 1113 (buildApprovalResultEmail_).
class MrfMailer < ApplicationMailer
  def new_request(project_name, requestor_email, items, is_returnable, recipients)
    @project_name = project_name
    @requestor_email = requestor_email
    @items = items
    @type_label = is_returnable ? "Returnable Tool Request" : "Material Request Form (MRF)"
    @app_url = root_url
    subject_prefix = is_returnable ? "[New Returnable Request]" : "[New MRF]"
    mail(to: recipients.first, bcc: recipients.drop(1),
         subject: "#{subject_prefix} #{project_name} — Action Required | SP Bedana")
  end

  def approval_result(action, request_id, project_name, requestor_email, processed_items)
    @is_approved = action == "Approve"
    @request_id = request_id
    @project_name = project_name
    @requestor_email = requestor_email
    @processed_items = processed_items
    status_word = @is_approved ? "APPROVED" : "REJECTED"
    mail(to: requestor_email, subject: "[MRF #{status_word}] #{request_id} — SP Bedana")
  end
end
