require "test_helper"

class Api::DataManagementControllerTest < ActionDispatch::IntegrationTest
  setup do
    RolePermission.create!(role: "admin", allowed_tabs: "admin")
    User.create!(name: "Admin", email: "admin@test.local", role: "admin", password: "Secret123!")
    post "/api/verifyLogin", params: { args: ["admin@test.local", "Secret123!"] }, as: :json
  end

  def api(fn, *fn_args)
    post "/api/#{fn}", params: { args: fn_args }, as: :json
    JSON.parse(response.body)
  end

  test "a project with no attached data can be viewed and deleted" do
    project = Project.create!(code: "STUCK PROJECT", customer_name: "Someone")

    rows = api("getManagedRows", "projects")
    assert_response :success
    assert(rows["rows"].any? { |r| r["code"] == "STUCK PROJECT" })

    api("deleteManagedRow", "projects", project.id)
    assert_response :success
    refute Project.exists?(project.id)
  end

  test "a project with BOQ items cannot be deleted" do
    project = Project.create!(code: "PRJ1")
    BoqItem.create!(project_code: "PRJ1", item: "Cement", qty: 10, uom: "bags")

    post "/api/deleteManagedRow", params: { args: ["projects", project.id] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/BOQ items/, JSON.parse(response.body)["error"])
    assert Project.exists?(project.id)
  end

  test "a project with MRF requests cannot be deleted" do
    project = Project.create!(code: "PRJ2")
    MrfItem.create!(project_code: "PRJ2", item: "Cement", mrf_code: "MRF-PRJ2-1", status: "Pending")

    post "/api/deleteManagedRow", params: { args: ["projects", project.id] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/MRF requests/, JSON.parse(response.body)["error"])
  end

  # Suppliers no longer have their own "Manage Data" screen entry (edit/delete
  # moved to Accounting -> Supplier Data, see portal.js), but they still go
  # through these same generic endpoints -- lock that in.
  test "a supplier can be listed, edited, and deleted via the generic managed-row endpoints" do
    supplier = Supplier.create!(company_name: "ACME Corp", contact_person: "Jane Doe", email: "jane@acme.test")

    rows = api("getManagedRows", "suppliers")
    assert_response :success
    assert(rows["rows"].any? { |r| r["company_name"] == "ACME Corp" && r["id"] == supplier.id })

    api("updateManagedRow", "suppliers", supplier.id, { "company_name" => "ACME Corporation" })
    assert_response :success
    assert_equal "ACME Corporation", supplier.reload.company_name

    api("deleteManagedRow", "suppliers", supplier.id)
    assert_response :success
    refute Supplier.exists?(supplier.id)
  end

  test "a delivery record can be edited and deleted (previously had no correction UI anywhere)" do
    delivery = Delivery.create!(received_date: Time.current, delivery_doc_number: "DR-1",
                                po_number: "PO-1", item_name: "Cement", quantity: 10,
                                receiver_email: "admin@test.local")

    # The real edit modal always submits every field, not just the changed
    # one (see boq_projects_panel.js/csv_import.js) -- match that shape here,
    # since update_managed_row only validates required-ness against whatever
    # keys are actually submitted.
    api("updateManagedRow", "deliveries", delivery.id, {
      "po_number" => "PO-1", "item_name" => "Cement", "quantity" => "8"
    })
    assert_response :success
    assert_equal 8.0, delivery.reload.quantity.to_f

    api("deleteManagedRow", "deliveries", delivery.id)
    assert_response :success
    refute Delivery.exists?(delivery.id)
  end

  test "a reimbursement record can be edited and deleted (previously had no correction UI anywhere)" do
    reimbursement = Reimbursement.create!(project_code: "PRJ1", expense_type: "Fuel",
                                          particulars: "Gasoline", amount: 500)

    api("updateManagedRow", "reimbursements", reimbursement.id, {
      "project_code" => "PRJ1", "amount" => "450"
    })
    assert_response :success
    assert_equal 450.0, reimbursement.reload.amount.to_f

    api("deleteManagedRow", "reimbursements", reimbursement.id)
    assert_response :success
    refute Reimbursement.exists?(reimbursement.id)
  end

  test "editing and deleting a managed row writes an audit entry, retrievable via getManagedRowHistory" do
    supplier = Supplier.create!(company_name: "ACME Corp", email: "old@acme.test")

    api("updateManagedRow", "suppliers", supplier.id, { "company_name" => "ACME Corp", "email" => "new@acme.test" })
    assert_response :success
    api("deleteManagedRow", "suppliers", supplier.id)
    assert_response :success

    history = api("getManagedRowHistory", "suppliers")
    assert_response :success
    assert_equal 2, history.length # newest first: delete, then update

    delete_entry = history[0]
    assert_equal "delete", delete_entry["action"]
    assert_equal "ACME Corp", delete_entry["label"]
    assert_equal "admin@test.local", delete_entry["actor"]

    update_entry = history[1]
    assert_equal "update", update_entry["action"]
    assert_match(/email.*old@acme\.test.*new@acme\.test/, update_entry["detail"])
  end

  test "getManagedRowHistory only returns entries for the requested type" do
    Supplier.create!(company_name: "ACME Corp").tap do |s|
      api("deleteManagedRow", "suppliers", s.id)
    end
    Material.create!(item_name: "Cement").tap do |m|
      api("deleteManagedRow", "materials", m.id)
    end

    assert_equal 1, api("getManagedRowHistory", "suppliers").length
    assert_equal 1, api("getManagedRowHistory", "materials").length
  end
end
