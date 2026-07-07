# Loads a realistic example project ("DEMO-001") through every stage of the
# pipeline so the system can be clicked through and tested with real-looking
# data instead of empty screens. See docs/EXAMPLE-DATA-GUIDE.md at the repo
# root for what gets created and how to use it.
namespace :sample_data do
  desc "Load an example project with data at every pipeline stage, for manual testing"
  task load: :environment do
    if Project.exists?(code: "DEMO-001")
      puts "Sample data already loaded (DEMO-001 exists)."
      puts "Run `bin/rails sample_data:clear` first if you want to reload it fresh."
      next
    end

    now = Time.current
    puts "Loading sample data..."

    # --- Suppliers ---
    supplier_a = Supplier.create!(
      company_name: "ABC Hardware Supply", contact_person: "Ana Cruz",
      email: "sales@abchardware.example", phone: "0917-111-2222", tin: "111-222-333-000",
      category: "Materials", address: "45 Aurora Blvd, Cubao, Quezon City",
      bank_details: "BDO - 001122334455", supplier_type: "Materials Supplier",
      encoder_email: "admin@vegastar.local"
    )
    supplier_b = Supplier.create!(
      company_name: "BuildMart Trading", contact_person: "Mark Santos",
      email: "orders@buildmart.example", phone: "0918-333-4444", tin: "444-555-666-000",
      category: "Materials", address: "88 EDSA, Mandaluyong City",
      bank_details: "BPI - 998877665544", supplier_type: "Materials Supplier",
      encoder_email: "admin@vegastar.local"
    )
    puts "  2 suppliers"

    # --- Materials catalog ---
    [
      { item_name: "4000 psi Portland Cement", unit: "bag", actual_cost: 245, quoted_cost: 260 },
      { item_name: "10mm x 6m Deformed Bar", unit: "pc", actual_cost: 185, quoted_cost: 200 },
      { item_name: "4-inch CHB", unit: "pc", actual_cost: 14, quoted_cost: 16 }
    ].each { |m| Material.create!(m) }
    puts "  3 catalog materials"

    # --- Project DEMO-001 + BOQ ---
    Project.create!(
      code: "DEMO-001", customer_name: "Juan Dela Cruz", phone: "0917-555-0100",
      email: "juan.delacruz@example.com", site_location: "123 Rizal St, Brgy. San Isidro, Quezon City",
      billing_address: "Same as site address", tin: "123-456-789-000", company: "Vegastar Construction",
      quoted_cost: 850_000,
      milestone_terms: [{ "label" => "Mobilization", "percent" => 25 }, { "label" => "Completion", "percent" => 75 }]
    )

    boq_rows = [
      { phase: "Civil Works", scope: "1.1 Foundation", item: "Excavation and Backfilling",
        qty: 120, uom: "cu.m.", unit_labor_cost: 150, unit_material_cost: 0,
        total_labor: 18_000, total_material: 0, labor_cost_k: 18_000, total_cost: 18_000 },
      { phase: "Civil Works", scope: "1.1 Foundation", item: "Reinforced Concrete Footing",
        qty: 24, uom: "cu.m.", unit_labor_cost: 850, unit_material_cost: 4200,
        total_labor: 20_400, total_material: 100_800, labor_cost_k: 20_400, total_cost: 121_200 },
      { phase: "Civil Works", scope: "1.2 Superstructure", item: "CHB Wall (4in)",
        qty: 350, uom: "sq.m.", unit_labor_cost: 220, unit_material_cost: 480,
        total_labor: 77_000, total_material: 168_000, labor_cost_k: 77_000, total_cost: 245_000 },
      { phase: "Civil Works", scope: "1.2 Superstructure", item: "Reinforcing Steel Bars",
        qty: 3.5, uom: "MT", unit_labor_cost: 8500, unit_material_cost: 65_000,
        total_labor: 29_750, total_material: 227_500, labor_cost_k: 29_750, total_cost: 257_250 }
    ]
    boq_rows.each do |r|
      BoqItem.create!(r.merge(project_code: "DEMO-001", company: "Vegastar Construction",
                              source_file: "demo-seed", entry_date: now))
    end
    puts "  Project DEMO-001 with #{boq_rows.length} BOQ items"

    # --- A second, not-yet-approved BOQ waiting for you to accept ---
    demo2_payload = {
      "project" => {
        "code" => "DEMO 002", "customerName" => "Maria Santos", "phone" => "0928-444-5555",
        "email" => "maria.santos@example.com", "site" => "56 Katipunan Ave, Loyola Heights, Quezon City",
        "billing" => "Same as site address", "birthday" => "", "tin" => "987-654-321-000",
        "company" => "Vegastar Construction", "quotedCost" => 420_000, "milestoneTerms" => []
      },
      "items" => [
        { "phase" => "Interior Works", "scope" => "2.1 Finishes", "name" => "Ceramic Floor Tiles 60x60",
          "qty" => 180, "unit" => "sq.m.", "laborCost" => 150, "materialCost" => 650 },
        { "phase" => "Interior Works", "scope" => "2.1 Finishes", "name" => "Interior Painting Works",
          "qty" => 300, "unit" => "sq.m.", "laborCost" => 90, "materialCost" => 60 }
      ]
    }
    boq_sub_code = "BOQ-#{Date.current.strftime('%Y%m%d')}-#{(BoqSubmission.count + 1).to_s.rjust(3, '0')}"
    BoqSubmission.create!(submission_code: boq_sub_code, project_code: "DEMO 002",
                          submitter_email: "encoder@vegastar.local", status: "Pending", payload: demo2_payload)
    puts "  #{boq_sub_code}: Pending BOQ for \"DEMO 002\" -- log in as admin to Accept/Return/Reject it"

    # --- MRF #1: left Pending so you can practice approving it ---
    mrf1 = SequencedCode.next_mrf_code("DEMO-001")
    [
      { item: "CHB Wall (4in)", unit: "sq.m.", qty: 100, phase: "Civil Works", scope: "1.2 Superstructure" },
      { item: "Reinforcing Steel Bars", unit: "MT", qty: 1.5, phase: "Civil Works", scope: "1.2 Superstructure" }
    ].each do |r|
      OutLedgerEntry.create!(phase: r[:phase], item: r[:item], amount: r[:qty], unit: r[:unit],
        entry_date: now, project_code: "DEMO-001", control_code: "#{mrf1}-#{r[:item]}",
        movement_type: "Material Request")
      MrfItem.create!(entry_date: now, item: r[:item], unit: r[:unit], request_amount: r[:qty],
        project_code: "DEMO-001", phase: r[:phase], status: "Pending", mrf_code: mrf1,
        requester_email: "site.engineer@vegastar.local",
        remarks: "For wall and rebar works -- please review", scope: r[:scope])
    end
    puts "  #{mrf1}: Pending -- log in as approver@vegastar.local to approve it"

    # --- MRF #2: pushed all the way through the pipeline ---
    mrf2 = SequencedCode.next_mrf_code("DEMO-001")
    mrf2_items = [
      { item: "CHB Wall (4in)", unit: "sq.m.", qty: 200, phase: "Civil Works", scope: "1.2 Superstructure" },
      { item: "Reinforcing Steel Bars", unit: "MT", qty: 2, phase: "Civil Works", scope: "1.2 Superstructure" }
    ]
    mrf2_items.each do |r|
      OutLedgerEntry.create!(phase: r[:phase], item: r[:item], amount: r[:qty], unit: r[:unit],
        entry_date: now, project_code: "DEMO-001", control_code: "#{mrf2}-#{r[:item]}",
        movement_type: "Material Request")
      MrfItem.create!(entry_date: now, item: r[:item], unit: r[:unit], request_amount: r[:qty],
        project_code: "DEMO-001", phase: r[:phase], status: "Approved", approved_qty: r[:qty],
        action_timestamp: now, win_loss: "", po_code: "", mrf_code: mrf2,
        requester_email: "site.engineer@vegastar.local", remarks: "Approved for demo", scope: r[:scope])
    end

    begin
      approved_items = mrf2_items.map { |r| { item: r[:item], qty: r[:qty], unit: r[:unit], attachmentUrl: "", brand: "" } }
      rfq_url = PdfGenerator.store(doc_type: "rfq", reference_code: mrf2,
        html: RfqPdfBuilder.html(mrf2, approved_items), file_name: "RFQ_#{mrf2}.pdf")
      MrfItem.where(mrf_code: mrf2).update_all(pdf_url: rfq_url)
      puts "  #{mrf2}: Approved, RFQ generated"
    rescue => e
      puts "  #{mrf2}: Approved (RFQ PDF skipped -- #{e.message})"
    end

    # --- Supplier quotes + payment terms for MRF #2 ---
    SupplierQuote.create!(mrf_code: mrf2, item: "CHB Wall (4in)", supplier: supplier_a.company_name,
      amount: 96_000, encoder_email: "approver@vegastar.local", brand: "Eagle", delivery_fee: "0")
    SupplierQuote.create!(mrf_code: mrf2, item: "CHB Wall (4in)", supplier: supplier_b.company_name,
      amount: 99_000, encoder_email: "approver@vegastar.local", brand: "Holcim", delivery_fee: "500")
    SupplierQuote.create!(mrf_code: mrf2, item: "Reinforcing Steel Bars", supplier: supplier_a.company_name,
      amount: 130_000, encoder_email: "approver@vegastar.local", brand: "PhilSteel", delivery_fee: "0")
    SupplierQuote.create!(mrf_code: mrf2, item: "Reinforcing Steel Bars", supplier: supplier_b.company_name,
      amount: 128_000, encoder_email: "approver@vegastar.local", brand: "PhilSteel", delivery_fee: "800")

    PaymentTerm.create!(mrf_code: mrf2, supplier: supplier_a.company_name, description: "50% Down Payment", percentage: "50%")
    PaymentTerm.create!(mrf_code: mrf2, supplier: supplier_a.company_name, description: "50% within 30 days", percentage: "50%")
    PaymentTerm.create!(mrf_code: mrf2, supplier: supplier_b.company_name, description: "30% Down Payment", percentage: "30%")
    PaymentTerm.create!(mrf_code: mrf2, supplier: supplier_b.company_name, description: "70% within 45 days", percentage: "70%")
    puts "  Supplier quotes + payment terms encoded"

    # --- Award: CHB Wall to ABC Hardware, Rebar to BuildMart (split award) ---
    winners = [
      { "supplier" => supplier_a.company_name, "item" => "CHB Wall (4in)", "qty" => 200, "amount" => 96_000 },
      { "supplier" => supplier_b.company_name, "item" => "Reinforcing Steel Bars", "qty" => 2, "amount" => 128_000 }
    ]
    begin
      CanvasAwarder.call(mrf_code: mrf2, winners: winners, user: "approver@vegastar.local")
      puts "  Awarded -- 2 Purchase Orders generated"
    rescue => e
      puts "  WARNING: award failed (#{e.message}) -- receiving/payments below will be skipped"
    end

    po_items = PurchaseOrderItem.where(mrf_code: mrf2).to_a
    chb_po = po_items.find { |p| p.item_name == "CHB Wall (4in)" }
    rebar_po = po_items.find { |p| p.item_name == "Reinforcing Steel Bars" }

    # --- Receiving: CHB fully delivered, Rebar partially delivered ---
    if chb_po
      Delivery.create!(received_date: now - 3.days, delivery_doc_number: "DR-DEMO-0001",
        receiver_email: "site.engineer@vegastar.local", item_name: chb_po.item_name,
        quantity: chb_po.quantity, po_number: chb_po.po_number, remarks: "Full delivery, good condition")
    end
    if rebar_po
      Delivery.create!(received_date: now - 1.day, delivery_doc_number: "DR-DEMO-0002",
        receiver_email: "site.engineer@vegastar.local", item_name: rebar_po.item_name,
        quantity: (rebar_po.quantity.to_f / 2).round(2), po_number: rebar_po.po_number,
        remarks: "Partial delivery -- remainder pending")
    end
    puts "  Receiving logged (CHB Wall: fully delivered, Rebar: partially delivered)"

    # --- Payments & checks: one paid, one still pending for you to try ---
    if chb_po
      IssuePayment.create!(mrf_code: mrf2, po_number: chb_po.po_number, term_description: "50% Down Payment",
        percentage: "50%", supplier: supplier_a.company_name, invoiced_amount: 96_000,
        due_date: (now - 3.days).to_date.to_s, bank: "BDO", check_number: "CHK-DEMO-1001",
        payment_amount: 48_000, encoder_email: "accountant@vegastar.local")

      Check.create!(check_date: (now - 2.days).to_date, project_name: "DEMO-001", bank: "BDO",
        check_number: "CHK-DEMO-1001", amount: 48_000, encoded_by: "accountant@vegastar.local",
        encode_date: now - 2.days, status: "Deposited")
    end
    Check.create!(check_date: now.to_date, project_name: "DEMO-001", bank: "BPI",
      check_number: "CHK-DEMO-1002", amount: 70_000, encoded_by: "accountant@vegastar.local",
      encode_date: now, status: "Not Deposited")
    puts "  1 payment issued + 1 check deposited; 1 check left Not Deposited for you to test"

    # --- Expenses (incl. an auto-refund example) ---
    Expense.create!(entry_date: now, project_code: "DEMO-001", expense_type: "Material",
      particular: "Fuel and hauling", total_amount: 3_500.75, encoder_email: "encoder@vegastar.local")
    Expense.create!(entry_date: now, project_code: "DEMO-001", expense_type: "Others",
      particular: "H.O: Construction Bond", total_amount: 20_000, encoder_email: "encoder@vegastar.local")
    PendingRefund.create!(entry_date: now, project_code: "DEMO-001", particular: "H.O: Construction Bond",
      total_amount: 20_000, status: "Pending", encoder_email: "encoder@vegastar.local")
    puts "  2 expenses logged (1 pending Construction Bond refund waiting in Refundable Expenses)"

    # --- Petty cash / reimbursement, with a placeholder receipt attached ---
    reimb = Reimbursement.create!(project_code: "DEMO-001", expense_type: "Petty Cash",
      particulars: "Site engineer's meals and transportation for site visit",
      amount: 850, encoder_email: "site.engineer@vegastar.local")
    reimb.receipt.attach(io: StringIO.new("Sample receipt placeholder for demo data."),
                         filename: "demo-receipt.txt", content_type: "text/plain")
    puts "  1 petty cash reimbursement with a sample receipt attached"

    # --- Project progress + RTB ---
    ProjectProgress.create!(project_code: "DEMO-001", overall_percent: 35,
      phase_breakdown: [{ "phase" => "Civil Works", "percent" => 35 }],
      encoder_email: "project.engineer@vegastar.local")

    rtb_code = SequencedCode.next_rtb_code("DEMO-001")
    RtbLog.create!(rtb_code: rtb_code, project_code: "DEMO-001", percent_to_bill: 25,
      calculated_amount: 850_000 * 0.25, status: "Pending", encoder_email: "project.engineer@vegastar.local")
    puts "  #{rtb_code}: Pending RTB -- log in as accountant@vegastar.local to approve/collect it"

    # --- Subcontractor + work package + milestones + a progress report ---
    sub = Subcontractor.create!(sub_code: SequencedCode.next_sub_code, name: "Demo Builders Co.",
      tin: "555-666-777-000", contact: "0919-555-0000", active: true, created_by: "admin@vegastar.local")
    SubconAudit.log!("Subcontractor", sub.sub_code, "create", "Created: Demo Builders Co. (sample data)", "admin@vegastar.local")

    wp_result = WorkPackageCreator.call({
      "project" => "DEMO-001", "subId" => sub.sub_code, "label" => "Masonry and Rebar Works",
      "basis" => "labor", "contractValue" => 90_000,
      "lines" => [
        { "phase" => "Civil Works", "scope" => "1.2 Superstructure", "item" => "CHB Wall (4in)",
          "costLabor" => 77_000, "costMaterial" => 168_000, "costTotal" => 245_000 },
        { "phase" => "Civil Works", "scope" => "1.2 Superstructure", "item" => "Reinforcing Steel Bars",
          "costLabor" => 29_750, "costMaterial" => 227_500, "costTotal" => 257_250 }
      ],
      "milestones" => [
        { "seq" => 1, "label" => "Mobilization", "targetPct" => 25, "paymentPct" => 40 },
        { "seq" => 2, "label" => "Completion", "targetPct" => 100, "paymentPct" => 60 }
      ]
    }, "subcontractor@vegastar.local")
    puts "  #{wp_result[:wpId]}: work package created for Demo Builders Co."

    report = SubconReport.create!(report_code: SequencedCode.next_report_code, wp_code: wp_result[:wpId],
      project_code: "DEMO-001", payment_term: "Mobilization", percent_complete: 30,
      narrative: "Blocked out ground floor walls; rebar cutting in progress.",
      reported_by: "subcontractor@vegastar.local", reported_by_name: "Test Subcontractor")
    SubconAudit.log!("Report", report.report_code, "create report",
                     "WP: #{wp_result[:wpId]} | 30% complete", "subcontractor@vegastar.local")
    MilestoneAutoFlagger.call(wp_code: wp_result[:wpId], percent_complete: 30, report_code: report.report_code)
    puts "  #{report.report_code}: 30% complete reported -- Mobilization milestone auto-flagged Ready to Pay"
    puts "    (Completion milestone stays Open -- log in as accountant to link a check to the Ready one)"

    puts ""
    puts "Sample data loaded. See docs/EXAMPLE-DATA-GUIDE.md for a guided walkthrough."
  end

  desc "Remove all sample/example data loaded by sample_data:load"
  task clear: :environment do
    demo_mrf_codes = MrfItem.where("mrf_code LIKE ?", "MRF-DEMO001-%").distinct.pluck(:mrf_code)
    demo_po_numbers = PurchaseOrderItem.where(mrf_code: demo_mrf_codes).distinct.pluck(:po_number)
    demo_wp_codes = WorkPackage.where(project_code: "DEMO-001").distinct.pluck(:wp_code)
    demo_sub_codes = Subcontractor.where(name: "Demo Builders Co.").distinct.pluck(:sub_code)
    demo_mil_codes = SubconMilestone.where(wp_code: demo_wp_codes).distinct.pluck(:milestone_code)
    demo_report_codes = SubconReport.where(wp_code: demo_wp_codes).distinct.pluck(:report_code)
    demo_boq_sub_codes = BoqSubmission.where(project_code: ["DEMO-001", "DEMO 002"]).distinct.pluck(:submission_code)

    GeneratedPdf.where(doc_type: "rfq", reference_code: demo_mrf_codes).destroy_all
    GeneratedPdf.where(doc_type: "po", reference_code: demo_po_numbers).destroy_all
    GeneratedPdf.where(doc_type: ["boq_approved", "boq_approval"], reference_code: demo_boq_sub_codes).destroy_all
    GeneratedPdf.where(doc_type: "work_package", reference_code: demo_wp_codes).destroy_all

    Delivery.where(po_number: demo_po_numbers).destroy_all
    IssuePayment.where(po_number: demo_po_numbers).destroy_all
    PurchaseOrderItem.where(mrf_code: demo_mrf_codes).destroy_all
    SupplierQuote.where(mrf_code: demo_mrf_codes).destroy_all
    PaymentTerm.where(mrf_code: demo_mrf_codes).destroy_all
    OutLedgerEntry.where(project_code: "DEMO-001").destroy_all
    MrfItem.where(mrf_code: demo_mrf_codes).destroy_all
    Check.where(check_number: ["CHK-DEMO-1001", "CHK-DEMO-1002"]).destroy_all

    SubconReport.where(wp_code: demo_wp_codes).destroy_all
    SubconMilestone.where(wp_code: demo_wp_codes).destroy_all
    WpBoqLine.where(wp_code: demo_wp_codes).destroy_all
    WorkPackage.where(project_code: "DEMO-001").destroy_all
    SubconAudit.where(entity_code: demo_wp_codes + demo_sub_codes + demo_mil_codes + demo_report_codes).destroy_all
    Subcontractor.where(name: "Demo Builders Co.").destroy_all

    Expense.where(project_code: "DEMO-001").destroy_all
    PendingRefund.where(project_code: "DEMO-001").destroy_all
    Reimbursement.where(project_code: "DEMO-001").destroy_all
    ProjectProgress.where(project_code: "DEMO-001").destroy_all
    RtbLog.where(project_code: "DEMO-001").destroy_all
    BoqSubmission.where(project_code: ["DEMO-001", "DEMO 002"]).destroy_all
    BoqItem.where(project_code: "DEMO-001").destroy_all
    Project.where(code: ["DEMO-001", "DEMO 002"]).destroy_all
    Supplier.where(company_name: ["ABC Hardware Supply", "BuildMart Trading"]).destroy_all
    Material.where(item_name: ["4000 psi Portland Cement", "10mm x 6m Deformed Bar", "4-inch CHB"]).destroy_all

    puts "Sample data cleared."
  end
end
