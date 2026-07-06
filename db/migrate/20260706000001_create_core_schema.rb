class CreateCoreSchema < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.string :role, null: false
      t.string :password_digest, null: false
      t.string :reset_token
      t.datetime :reset_token_expires_at
      t.timestamps
    end
    add_index :users, :email, unique: true
    add_index :users, :reset_token

    create_table :role_permissions do |t|
      t.string :role, null: false
      t.text :allowed_tabs, null: false, default: ""
      t.timestamps
    end
    add_index :role_permissions, :role, unique: true

    create_table :projects do |t|
      t.string :code, null: false
      t.string :customer_name
      t.string :phone
      t.string :email
      t.string :site_location
      t.string :billing_address
      t.date :birthday
      t.string :tin
      t.string :company
      t.decimal :quoted_cost, precision: 15, scale: 2
      t.jsonb :milestone_terms, default: []
      t.timestamps
    end
    add_index :projects, :code, unique: true

    # Mirrors the original "Logs" sheet grid positionally. The Apps Script
    # writers/readers used the same physical columns with different meanings
    # (e.g., Col F = unit material cost on Excel ingest but quoted cost on
    # native BOQ writes; Col J/K are rewritten by BOQ adjustments), so a
    # faithful port keeps the sheet-column mapping:
    #   phase=A item=B qty=C uom=D unit_labor_cost=E unit_material_cost=F
    #   total_labor=I total_material=J labor_cost_k=K total_cost=L
    #   project_code=X source_file=Y entry_date=Z scope=AA company=AB
    create_table :boq_items do |t|
      t.string :project_code, null: false
      t.string :phase
      t.string :scope
      t.text :item, null: false
      t.decimal :qty, precision: 15, scale: 4
      t.string :uom
      t.decimal :unit_labor_cost, precision: 15, scale: 2
      t.decimal :unit_material_cost, precision: 15, scale: 2
      t.decimal :total_labor, precision: 15, scale: 2
      t.decimal :total_material, precision: 15, scale: 2
      t.decimal :labor_cost_k, precision: 15, scale: 2
      t.decimal :total_cost, precision: 15, scale: 2
      t.string :source_file
      t.datetime :entry_date
      t.string :company
      t.timestamps
    end
    add_index :boq_items, :project_code

    create_table :mrf_items do |t|
      t.datetime :entry_date
      t.text :item, null: false
      t.string :unit
      t.decimal :request_amount, precision: 15, scale: 4
      t.string :project_code
      t.string :phase
      t.string :status, null: false, default: "Pending"
      t.string :mrf_code
      t.string :requester_email
      t.text :remarks
      t.string :attachment_url
      t.decimal :approved_qty, precision: 15, scale: 4
      t.datetime :action_timestamp
      t.string :win_loss
      t.string :po_code
      t.string :pdf_url
      t.string :preferred_brands
      t.string :scope
      t.timestamps
    end
    add_index :mrf_items, :mrf_code
    add_index :mrf_items, :project_code

    create_table :out_ledger_entries do |t|
      t.string :phase
      t.text :item
      t.decimal :amount, precision: 15, scale: 4
      t.string :unit
      t.datetime :entry_date
      t.string :project_code
      t.decimal :lot_amount, precision: 15, scale: 2
      t.string :control_code
      t.string :movement_type
      t.text :remarks
      t.string :encoder_email
      t.timestamps
    end
    add_index :out_ledger_entries, :control_code
    add_index :out_ledger_entries, :project_code

    create_table :purchase_order_items do |t|
      t.datetime :order_date
      t.string :po_number, null: false
      t.string :supplier
      t.text :item_name
      t.string :unit
      t.decimal :quantity, precision: 15, scale: 4
      t.decimal :unit_price, precision: 15, scale: 2
      t.string :status, default: "Draft"
      t.text :void_reason
      t.string :brand
      t.string :mrf_code
      t.timestamps
    end
    add_index :purchase_order_items, :po_number
    add_index :purchase_order_items, :mrf_code

    create_table :deliveries do |t|
      t.datetime :received_date
      t.string :delivery_doc_number
      t.string :receiver_email
      t.text :item_name
      t.decimal :quantity, precision: 15, scale: 4
      t.string :po_number
      t.text :url_pictures
      t.text :remarks
      t.timestamps
    end
    add_index :deliveries, :po_number

    create_table :supplier_quotes do |t|
      t.string :mrf_code
      t.text :item
      t.string :supplier
      t.decimal :amount, precision: 15, scale: 2
      t.string :encoder_email
      t.string :brand
      t.string :delivery_fee
      t.timestamps
    end
    add_index :supplier_quotes, :mrf_code

    create_table :payment_terms do |t|
      t.string :mrf_code
      t.string :supplier
      t.string :description
      # Stored as "30%" strings, matching the original Payment Terms sheet
      t.string :percentage
      t.timestamps
    end
    add_index :payment_terms, :mrf_code

    create_table :issue_payments do |t|
      t.string :mrf_code
      t.string :po_number
      t.string :term_description
      t.string :percentage
      t.string :supplier
      t.decimal :invoiced_amount, precision: 15, scale: 2
      t.string :due_date
      t.string :bank
      t.string :check_number
      t.decimal :payment_amount, precision: 15, scale: 2
      t.string :encoder_email
      t.timestamps
    end
    add_index :issue_payments, :po_number

    create_table :expenses do |t|
      t.datetime :entry_date
      t.string :project_code
      t.string :expense_type
      t.text :particular
      t.decimal :total_amount, precision: 15, scale: 2
      t.string :encoder_email
      t.timestamps
    end
    add_index :expenses, :project_code

    create_table :pending_refunds do |t|
      t.datetime :entry_date
      t.string :project_code
      t.text :particular
      t.decimal :total_amount, precision: 15, scale: 2
      t.string :status, default: "Pending"
      t.decimal :refunded_amount, precision: 15, scale: 2
      t.datetime :refund_date
      t.string :encoder_email
      t.timestamps
    end

    create_table :reimbursements do |t|
      t.string :project_code
      t.string :expense_type
      t.text :particulars
      t.decimal :amount, precision: 15, scale: 2
      t.string :receipt_url
      t.string :encoder_email
      t.timestamps
    end

    create_table :checks do |t|
      t.date :check_date
      t.string :project_name
      t.string :bank
      t.string :check_number
      t.decimal :amount, precision: 15, scale: 2
      t.string :encoded_by
      t.datetime :encode_date
      t.string :status, default: "Not Deposited"
      t.timestamps
    end
    add_index :checks, :status

    create_table :collections do |t|
      t.string :rtb_code
      t.string :project_code
      t.decimal :amount_collected, precision: 15, scale: 2
      t.string :bank
      t.string :due_date
      t.string :check_number
      t.string :encoder_email
      t.timestamps
    end

    create_table :rtb_logs do |t|
      t.string :rtb_code
      t.string :project_code
      t.decimal :percent_to_bill, precision: 8, scale: 4
      t.decimal :calculated_amount, precision: 15, scale: 2
      t.string :status, default: "Pending"
      t.string :encoder_email
      t.string :approver_email
      t.datetime :action_date
      t.timestamps
    end
    add_index :rtb_logs, :rtb_code

    create_table :project_progresses do |t|
      t.string :project_code
      t.decimal :overall_percent, precision: 8, scale: 4
      t.jsonb :phase_breakdown, default: []
      t.string :encoder_email
      t.timestamps
    end
    add_index :project_progresses, :project_code

    create_table :boq_submissions do |t|
      t.string :submission_code
      t.string :project_code
      t.string :submitter_email
      t.string :status, default: "Pending"
      t.jsonb :payload, default: {}
      t.text :admin_remarks
      t.string :action_by
      t.datetime :action_date
      t.string :pdf_url
      t.timestamps
    end
    add_index :boq_submissions, :submission_code, unique: true

    create_table :pricing_simulations do |t|
      t.string :project_title
      t.string :expense_type
      t.string :line_item
      t.decimal :percentage, precision: 8, scale: 4
      t.decimal :override_amount, precision: 15, scale: 2
      t.string :encoder_email
      t.timestamps
    end
    add_index :pricing_simulations, :project_title

    create_table :suppliers do |t|
      t.string :company_name
      t.string :contact_person
      t.string :email
      t.string :phone
      t.string :tin
      t.string :category
      t.text :address
      t.text :bank_details
      t.string :encoder_email
      t.string :supplier_type
      t.timestamps
    end

    create_table :materials do |t|
      t.text :item_name
      t.string :unit
      t.decimal :actual_cost, precision: 15, scale: 2
      t.decimal :quoted_cost, precision: 15, scale: 2
      t.timestamps
    end

    create_table :returnable_items do |t|
      t.string :project_code
      t.text :item_name
      t.decimal :quantity, precision: 15, scale: 4
      t.string :requester_email
      t.string :status, default: "Pending"
      t.timestamps
    end

    create_table :expense_list_entries do |t|
      t.string :expense_type, null: false
      t.string :item_name
      t.timestamps
    end

    create_table :hidden_expense_projects do |t|
      t.string :project_name, null: false
      t.string :hidden_by
      t.timestamps
    end
    add_index :hidden_expense_projects, :project_name, unique: true

    create_table :subcontractors do |t|
      t.string :sub_code, null: false
      t.string :name
      t.string :tin
      t.string :contact
      t.boolean :active, default: true
      t.string :created_by
      t.timestamps
    end
    add_index :subcontractors, :sub_code, unique: true

    create_table :work_packages do |t|
      t.string :wp_code, null: false
      t.string :sub_code
      t.string :subcontractor_name
      t.string :project_code
      t.string :label
      t.string :budget_basis
      t.decimal :contract_value, precision: 15, scale: 2
      t.string :contract_pdf_url
      t.string :status, default: "Open"
      t.string :created_by
      t.timestamps
    end
    add_index :work_packages, :wp_code, unique: true

    create_table :wp_boq_lines do |t|
      t.string :wp_code
      t.string :project_code
      t.string :phase
      t.string :scope
      t.text :item
      t.decimal :boq_cost, precision: 15, scale: 2
      t.decimal :allocated_cost, precision: 15, scale: 2
      t.timestamps
    end
    add_index :wp_boq_lines, :wp_code

    create_table :subcon_milestones do |t|
      t.string :milestone_code, null: false
      t.string :wp_code
      t.integer :seq
      t.string :label
      t.decimal :target_pct, precision: 8, scale: 4
      t.decimal :payment_pct, precision: 8, scale: 4
      t.decimal :amount, precision: 15, scale: 2
      t.boolean :ready_to_pay, default: false
      t.string :check_number
      t.string :status, default: "Open"
      t.timestamps
    end
    add_index :subcon_milestones, :milestone_code, unique: true
    add_index :subcon_milestones, :wp_code

    create_table :subcon_reports do |t|
      t.string :report_code
      t.string :wp_code
      t.string :project_code
      t.string :payment_term
      t.decimal :percent_complete, precision: 8, scale: 4
      t.text :narrative
      t.text :photos_url
      t.string :reported_by
      t.string :reported_by_name
      t.timestamps
    end
    add_index :subcon_reports, :wp_code

    create_table :subcon_audits do |t|
      t.string :entity
      t.string :entity_code
      t.string :action
      t.text :detail
      t.string :user_email
      t.timestamps
    end

    create_table :generated_pdfs do |t|
      t.string :doc_type, null: false
      t.string :reference_code, null: false
      t.timestamps
    end
    add_index :generated_pdfs, [:doc_type, :reference_code]
  end
end
