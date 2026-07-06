# Port of sendSubconReadyEmail_ — Source/code.js:6024. Recipients are users
# with the "accounting" role (getSubconNotifRecipients_).
class SubconMailer < ApplicationMailer
  def ready_to_pay(recipients, flagged_details, context)
    @flagged_details = flagged_details
    @context = context
    @trigger_line = if context[:reportId] == "MANUAL"
      "Manual override by #{context[:reporterName]}"
    else
      "#{context[:reporterName]} — #{context[:percentComplete]}% complete (Report #{context[:reportId]})"
    end
    mail(to: recipients,
         subject: "[Vegastar] Subcontractor milestone(s) ready to pay — #{context[:subName]}")
  end
end
