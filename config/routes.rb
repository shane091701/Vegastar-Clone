Rails.application.routes.draw do
  root "portal#index"

  namespace :api, defaults: { format: :json } do
    # Auth
    post "verifyLogin", to: "auth#verify_login"
    post "handleForgotPassword", to: "auth#handle_forgot_password"
    post "processPasswordReset", to: "auth#process_password_reset"
    post "logout", to: "auth#logout"

    # BOQ upload, adjustments & shared lookups
    post "processBOQ", to: "boq#process_boq"
    post "getProjectsListOnly", to: "boq#get_projects_list_only"
    post "getProjectCompanyMap", to: "boq#get_project_company_map"
    post "getInitialData", to: "boq#get_initial_data"
    post "getBoqDataForAdjustment", to: "boq#get_boq_data_for_adjustment"
    post "addBoqItem", to: "boq#add_boq_item"
    post "adjustBoqItem", to: "boq#adjust_boq_item"

    # Native BOQ builder & approvals
    post "getBoqBuilderData", to: "boq_builder#get_boq_builder_data"
    post "submitNativeBoqForApproval", to: "boq_builder#submit_native_boq_for_approval"
    post "getMyBoqSubmissions", to: "boq_builder#get_my_boq_submissions"
    post "getPendingBoqApprovals", to: "boq_builder#get_pending_boq_approvals"
    post "getBoqSubmissionPayload", to: "boq_builder#get_boq_submission_payload"
    post "processBoqApproval", to: "boq_builder#process_boq_approval"
    post "markBoqSubmissionResubmitted", to: "boq_builder#mark_boq_submission_resubmitted"
    post "generateBoqApprovalPdf", to: "boq_builder#generate_boq_approval_pdf"

    # MRF, approvals, RFQs, returnables
    post "submitRequest", to: "mrf#submit_request"
    post "getRequestHistory", to: "mrf#get_request_history"
    post "getApprovalQueueData", to: "mrf#get_approval_queue_data"
    post "processApproval", to: "mrf#process_approval"
    post "getRFQsList", to: "mrf#get_rfqs_list"
    post "voidAlphaRFQ", to: "mrf#void_alpha_rfq"
    post "submitReturnableRequest", to: "mrf#submit_returnable_request"
    post "getReturnableItemsData", to: "mrf#get_returnable_items_data"

    # Quotes, canvassing & award
    post "getPendingQuoteMRFs", to: "canvas#get_pending_quote_mrfs"
    post "saveSupplierQuotes", to: "canvas#save_supplier_quotes"
    post "getCanvasMRFList", to: "canvas#get_canvas_mrf_list"
    post "getCanvasPivotData", to: "canvas#get_canvas_pivot_data"
    post "awardCanvasWinners", to: "canvas#award_canvas_winners"
    post "getSukiItems", to: "canvas#get_suki_items"
    post "submitSukiPricing", to: "canvas#submit_suki_pricing"

    # Purchase orders
    post "getPurchaseOrders", to: "purchase_orders#get_purchase_orders"
    post "dispatchAlphaPO", to: "purchase_orders#dispatch_alpha_po"
    post "voidAlphaPO", to: "purchase_orders#void_alpha_po"

    # Suppliers
    post "saveSupplierData", to: "suppliers#save_supplier_data"
    post "getSuppliersList", to: "suppliers#get_suppliers_list"

    # Receiving
    post "getReceivingData", to: "receiving#get_receiving_data"
    post "submitReceivingToBackend", to: "receiving#submit_receiving_to_backend"
    post "getReceivingHistoryData", to: "receiving#get_receiving_history_data"

    # Expenses & refunds
    post "getExpenseInitialData", to: "expenses#get_expense_initial_data"
    post "getExpenseTypesAndItems", to: "expenses#get_expense_types_and_items"
    post "getExpenseProjectManageData", to: "expenses#get_expense_project_manage_data"
    post "toggleHiddenExpenseProject", to: "expenses#toggle_hidden_expense_project"
    post "submitExpenses", to: "expenses#submit_expenses"
    post "getPendingRefunds", to: "expenses#get_pending_refunds"
    post "submitRefundCredit", to: "expenses#submit_refund_credit"
    post "getExpenseSummaryForProject", to: "expenses#get_expense_summary_for_project"
    post "getMyRecentExpenses", to: "expenses#get_my_recent_expenses"

    # Petty cash / reimbursement
    post "submitPettyCashRecord", to: "petty_cash#submit_petty_cash_record"
    post "getPCLedgerData", to: "petty_cash#get_pc_ledger_data"

    # Checks
    post "logBulkPaymentData", to: "checks#log_bulk_payment_data"
    post "getPendingChecks", to: "checks#get_pending_checks"
    post "updateCheckStatus", to: "checks#update_check_status"

    # Issue payments & historical pricing
    post "getPoListForPayments", to: "payments#get_po_list_for_payments"
    post "getIssuePaymentDetails", to: "payments#get_issue_payment_details"
    post "saveIssuePayments", to: "payments#save_issue_payments"
    post "getUniqueHistoricalItems", to: "payments#get_unique_historical_items"
    post "getHistoricalPrices", to: "payments#get_historical_prices"

    # Project engineer, RTB, collections
    post "getProjectEngineerData", to: "rtb#get_project_engineer_data"
    post "submitProjectProgress", to: "rtb#submit_project_progress"
    post "submitRTBRequest", to: "rtb#submit_rtb_request"
    post "getPendingRTBs", to: "rtb#get_pending_rtbs"
    post "processRTB", to: "rtb#process_rtb"
    post "getApprovedRTBs", to: "rtb#get_approved_rtbs"
    post "submitCollection", to: "rtb#submit_collection"

    # Pricing simulator
    post "getProjectPricingData", to: "pricing#get_project_pricing_data"
    post "savePricingSimulation", to: "pricing#save_pricing_simulation"

    # Subcontractors
    post "getSubcontractors", to: "subcontractors#get_subcontractors"
    post "saveSubcontractor", to: "subcontractors#save_subcontractor"
    post "toggleSubcontractorActive", to: "subcontractors#toggle_subcontractor_active"
    post "getBoqLinesForAssignment", to: "subcontractors#get_boq_lines_for_assignment"
    post "saveWorkPackage", to: "subcontractors#save_work_package"
    post "getWorkPackagesForProject", to: "subcontractors#get_work_packages_for_project"
    post "getMilestonesForWp", to: "subcontractors#get_milestones_for_wp"
    post "getWpMilestonesForAp", to: "subcontractors#get_wp_milestones_for_ap"
    post "getSubconReportsData", to: "subcontractors#get_subcon_reports_data"
    post "submitSubconReport", to: "subcontractors#submit_subcon_report"
    post "markMilestoneReady", to: "subcontractors#mark_milestone_ready"
    post "getLinkableChecksForSub", to: "subcontractors#get_linkable_checks_for_sub"
    post "linkCheckToMilestone", to: "subcontractors#link_check_to_milestone"
    post "unlinkCheckFromMilestone", to: "subcontractors#unlink_check_from_milestone"
    post "getSubconApData", to: "subcontractors#get_subcon_ap_data"
    post "getSubconBudgetData", to: "subcontractors#get_subcon_budget_data"
    post "getSubconPayables", to: "subcontractors#get_subcon_payables"
    post "generateWorkPackagePdf", to: "subcontractors#generate_work_package_pdf"
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
