# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_13_150001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "assign_companies", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_assign_companies_on_name", unique: true
  end

  create_table "boq_items", force: :cascade do |t|
    t.string "company"
    t.datetime "created_at", null: false
    t.datetime "entry_date"
    t.text "item", null: false
    t.decimal "labor_cost_k", precision: 15, scale: 2
    t.string "phase"
    t.string "project_code", null: false
    t.decimal "qty", precision: 15, scale: 4
    t.string "scope"
    t.string "source_file"
    t.decimal "total_cost", precision: 15, scale: 2
    t.decimal "total_labor", precision: 15, scale: 2
    t.decimal "total_material", precision: 15, scale: 2
    t.decimal "unit_labor_cost", precision: 15, scale: 2
    t.decimal "unit_material_cost", precision: 15, scale: 2
    t.string "uom"
    t.datetime "updated_at", null: false
    t.index ["project_code"], name: "index_boq_items_on_project_code"
  end

  create_table "boq_submissions", force: :cascade do |t|
    t.string "action_by"
    t.datetime "action_date"
    t.text "admin_remarks"
    t.datetime "created_at", null: false
    t.jsonb "payload", default: {}
    t.string "pdf_url"
    t.string "project_code"
    t.string "status", default: "Pending"
    t.string "submission_code"
    t.string "submitter_email"
    t.datetime "updated_at", null: false
    t.index ["submission_code"], name: "index_boq_submissions_on_submission_code", unique: true
  end

  create_table "checks", force: :cascade do |t|
    t.decimal "amount", precision: 15, scale: 2
    t.string "bank"
    t.date "check_date"
    t.string "check_number"
    t.datetime "created_at", null: false
    t.datetime "encode_date"
    t.string "encoded_by"
    t.string "project_name"
    t.string "status", default: "Not Deposited"
    t.datetime "updated_at", null: false
    t.index ["status"], name: "index_checks_on_status"
  end

  create_table "collections", force: :cascade do |t|
    t.decimal "amount_collected", precision: 15, scale: 2
    t.string "bank"
    t.string "check_number"
    t.datetime "created_at", null: false
    t.string "due_date"
    t.string "encoder_email"
    t.string "project_code"
    t.string "rtb_code"
    t.datetime "updated_at", null: false
  end

  create_table "data_audits", force: :cascade do |t|
    t.string "action", null: false
    t.string "actor_email"
    t.datetime "created_at", null: false
    t.text "detail"
    t.string "entity_label"
    t.string "entity_type", null: false
    t.bigint "record_id"
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_data_audits_on_created_at"
    t.index ["entity_type", "record_id"], name: "index_data_audits_on_entity_type_and_record_id"
  end

  create_table "deliveries", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "delivery_doc_number"
    t.text "item_name"
    t.string "po_number"
    t.decimal "quantity", precision: 15, scale: 4
    t.datetime "received_date"
    t.string "receiver_email"
    t.text "remarks"
    t.datetime "updated_at", null: false
    t.text "url_pictures"
    t.index ["po_number"], name: "index_deliveries_on_po_number"
  end

  create_table "expense_list_entries", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "expense_type", null: false
    t.string "item_name"
    t.datetime "updated_at", null: false
  end

  create_table "expenses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.datetime "entry_date"
    t.string "expense_type"
    t.text "particular"
    t.string "project_code"
    t.decimal "total_amount", precision: 15, scale: 2
    t.datetime "updated_at", null: false
    t.index ["project_code"], name: "index_expenses_on_project_code"
  end

  create_table "generated_pdfs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "doc_type", null: false
    t.string "reference_code", null: false
    t.datetime "updated_at", null: false
    t.index ["doc_type", "reference_code"], name: "index_generated_pdfs_on_doc_type_and_reference_code"
  end

  create_table "hidden_expense_projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "hidden_by"
    t.string "project_name", null: false
    t.datetime "updated_at", null: false
    t.index ["project_name"], name: "index_hidden_expense_projects_on_project_name", unique: true
  end

  create_table "issue_payments", force: :cascade do |t|
    t.string "bank"
    t.string "check_number"
    t.datetime "created_at", null: false
    t.string "due_date"
    t.string "encoder_email"
    t.decimal "invoiced_amount", precision: 15, scale: 2
    t.string "mrf_code"
    t.decimal "payment_amount", precision: 15, scale: 2
    t.string "percentage"
    t.string "po_number"
    t.string "supplier"
    t.string "term_description"
    t.datetime "updated_at", null: false
    t.index ["po_number"], name: "index_issue_payments_on_po_number"
  end

  create_table "materials", force: :cascade do |t|
    t.decimal "actual_cost", precision: 15, scale: 2
    t.datetime "created_at", null: false
    t.text "item_name"
    t.decimal "quoted_cost", precision: 15, scale: 2
    t.string "unit"
    t.datetime "updated_at", null: false
  end

  create_table "mrf_items", force: :cascade do |t|
    t.datetime "action_timestamp"
    t.decimal "approved_qty", precision: 15, scale: 4
    t.string "attachment_url"
    t.datetime "created_at", null: false
    t.datetime "entry_date"
    t.text "item", null: false
    t.string "mrf_code"
    t.string "pdf_url"
    t.string "phase"
    t.string "po_code"
    t.string "preferred_brands"
    t.string "project_code"
    t.text "remarks"
    t.decimal "request_amount", precision: 15, scale: 4
    t.string "requester_email"
    t.string "scope"
    t.string "status", default: "Pending", null: false
    t.string "unit"
    t.datetime "updated_at", null: false
    t.string "win_loss"
    t.index ["mrf_code"], name: "index_mrf_items_on_mrf_code"
    t.index ["project_code"], name: "index_mrf_items_on_project_code"
  end

  create_table "out_ledger_entries", force: :cascade do |t|
    t.decimal "amount", precision: 15, scale: 4
    t.string "control_code"
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.datetime "entry_date"
    t.text "item"
    t.decimal "lot_amount", precision: 15, scale: 2
    t.string "movement_type"
    t.string "phase"
    t.string "project_code"
    t.text "remarks"
    t.string "unit"
    t.datetime "updated_at", null: false
    t.index ["control_code"], name: "index_out_ledger_entries_on_control_code"
    t.index ["project_code"], name: "index_out_ledger_entries_on_project_code"
  end

  create_table "payment_terms", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "description"
    t.string "mrf_code"
    t.string "percentage"
    t.string "supplier"
    t.datetime "updated_at", null: false
    t.index ["mrf_code"], name: "index_payment_terms_on_mrf_code"
  end

  create_table "pending_refunds", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.datetime "entry_date"
    t.text "particular"
    t.string "project_code"
    t.datetime "refund_date"
    t.decimal "refunded_amount", precision: 15, scale: 2
    t.string "status", default: "Pending"
    t.decimal "total_amount", precision: 15, scale: 2
    t.datetime "updated_at", null: false
  end

  create_table "pricing_simulations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.string "expense_type"
    t.string "line_item"
    t.decimal "override_amount", precision: 15, scale: 2
    t.decimal "percentage", precision: 8, scale: 4
    t.string "project_title"
    t.datetime "updated_at", null: false
    t.index ["project_title"], name: "index_pricing_simulations_on_project_title"
  end

  create_table "project_progresses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.decimal "overall_percent", precision: 8, scale: 4
    t.jsonb "phase_breakdown", default: []
    t.string "project_code"
    t.datetime "updated_at", null: false
    t.index ["project_code"], name: "index_project_progresses_on_project_code"
  end

  create_table "projects", force: :cascade do |t|
    t.string "billing_address"
    t.date "birthday"
    t.string "code", null: false
    t.string "company"
    t.datetime "created_at", null: false
    t.string "customer_name"
    t.string "email"
    t.jsonb "milestone_terms", default: []
    t.string "phone"
    t.decimal "quoted_cost", precision: 15, scale: 2
    t.string "site_location"
    t.string "tin"
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_projects_on_code", unique: true
  end

  create_table "purchase_order_items", force: :cascade do |t|
    t.string "brand"
    t.datetime "created_at", null: false
    t.text "item_name"
    t.string "mrf_code"
    t.datetime "order_date"
    t.string "po_number", null: false
    t.decimal "quantity", precision: 15, scale: 4
    t.string "status", default: "Draft"
    t.string "supplier"
    t.string "unit"
    t.decimal "unit_price", precision: 15, scale: 2
    t.datetime "updated_at", null: false
    t.text "void_reason"
    t.index ["mrf_code"], name: "index_purchase_order_items_on_mrf_code"
    t.index ["po_number"], name: "index_purchase_order_items_on_po_number"
  end

  create_table "reimbursements", force: :cascade do |t|
    t.decimal "amount", precision: 15, scale: 2
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.string "expense_type"
    t.text "particulars"
    t.string "project_code"
    t.string "receipt_url"
    t.datetime "updated_at", null: false
  end

  create_table "returnable_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "item_name"
    t.string "project_code"
    t.decimal "quantity", precision: 15, scale: 4
    t.string "requester_email"
    t.string "status", default: "Pending"
    t.datetime "updated_at", null: false
  end

  create_table "role_permissions", force: :cascade do |t|
    t.text "allowed_tabs", default: "", null: false
    t.datetime "created_at", null: false
    t.string "role", null: false
    t.datetime "updated_at", null: false
    t.index ["role"], name: "index_role_permissions_on_role", unique: true
  end

  create_table "rtb_logs", force: :cascade do |t|
    t.datetime "action_date"
    t.string "approver_email"
    t.decimal "calculated_amount", precision: 15, scale: 2
    t.datetime "created_at", null: false
    t.string "encoder_email"
    t.decimal "percent_to_bill", precision: 8, scale: 4
    t.string "project_code"
    t.string "rtb_code"
    t.string "status", default: "Pending"
    t.datetime "updated_at", null: false
    t.index ["rtb_code"], name: "index_rtb_logs_on_rtb_code"
  end

  create_table "subcon_audits", force: :cascade do |t|
    t.string "action"
    t.datetime "created_at", null: false
    t.text "detail"
    t.string "entity"
    t.string "entity_code"
    t.datetime "updated_at", null: false
    t.string "user_email"
  end

  create_table "subcon_milestones", force: :cascade do |t|
    t.decimal "amount", precision: 15, scale: 2
    t.string "check_number"
    t.datetime "created_at", null: false
    t.string "label"
    t.string "milestone_code", null: false
    t.decimal "payment_pct", precision: 8, scale: 4
    t.boolean "ready_to_pay", default: false
    t.integer "seq"
    t.string "status", default: "Open"
    t.decimal "target_pct", precision: 8, scale: 4
    t.datetime "updated_at", null: false
    t.string "wp_code"
    t.index ["milestone_code"], name: "index_subcon_milestones_on_milestone_code", unique: true
    t.index ["wp_code"], name: "index_subcon_milestones_on_wp_code"
  end

  create_table "subcon_reports", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "narrative"
    t.string "payment_term"
    t.decimal "percent_complete", precision: 8, scale: 4
    t.text "photos_url"
    t.string "project_code"
    t.string "report_code"
    t.string "reported_by"
    t.string "reported_by_name"
    t.datetime "updated_at", null: false
    t.string "wp_code"
    t.index ["wp_code"], name: "index_subcon_reports_on_wp_code"
  end

  create_table "subcontractors", force: :cascade do |t|
    t.boolean "active", default: true
    t.string "contact"
    t.datetime "created_at", null: false
    t.string "created_by"
    t.string "name"
    t.string "sub_code", null: false
    t.string "tin"
    t.datetime "updated_at", null: false
    t.index ["sub_code"], name: "index_subcontractors_on_sub_code", unique: true
  end

  create_table "supplier_quotes", force: :cascade do |t|
    t.decimal "amount", precision: 15, scale: 2
    t.string "brand"
    t.datetime "created_at", null: false
    t.string "delivery_fee"
    t.string "encoder_email"
    t.text "item"
    t.string "mrf_code"
    t.string "supplier"
    t.datetime "updated_at", null: false
    t.index ["mrf_code"], name: "index_supplier_quotes_on_mrf_code"
  end

  create_table "suppliers", force: :cascade do |t|
    t.text "address"
    t.text "bank_details"
    t.string "category"
    t.string "company_name"
    t.string "contact_person"
    t.datetime "created_at", null: false
    t.string "email"
    t.string "encoder_email"
    t.string "phone"
    t.string "supplier_type"
    t.string "tin"
    t.datetime "updated_at", null: false
  end

  create_table "users", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.boolean "must_change_password", default: false, null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.string "reset_token"
    t.datetime "reset_token_expires_at"
    t.string "role", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_token"], name: "index_users_on_reset_token"
  end

  create_table "work_packages", force: :cascade do |t|
    t.string "budget_basis"
    t.string "contract_pdf_url"
    t.decimal "contract_value", precision: 15, scale: 2
    t.datetime "created_at", null: false
    t.string "created_by"
    t.string "label"
    t.string "project_code"
    t.string "status", default: "Open"
    t.string "sub_code"
    t.string "subcontractor_name"
    t.datetime "updated_at", null: false
    t.string "wp_code", null: false
    t.index ["wp_code"], name: "index_work_packages_on_wp_code", unique: true
  end

  create_table "wp_boq_lines", force: :cascade do |t|
    t.decimal "allocated_cost", precision: 15, scale: 2
    t.decimal "boq_cost", precision: 15, scale: 2
    t.datetime "created_at", null: false
    t.text "item"
    t.string "phase"
    t.string "project_code"
    t.string "scope"
    t.datetime "updated_at", null: false
    t.string "wp_code"
    t.index ["wp_code"], name: "index_wp_boq_lines_on_wp_code"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
end
