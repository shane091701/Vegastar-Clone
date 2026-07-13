Feature: Manage Data screen -- edit, delete, and audit trail
  As an admin
  I want to correct or remove reference/historical records and see who did what
  So that mistakes (stuck records, typos) can be fixed without touching the database directly

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | admin@test.local     | Admin    | admin     | Secret123!  |
    And I am logged in as "admin@test.local"

  Scenario: An admin can edit a supplier and the change is recorded in its history
    Given a supplier "ACME Corp" exists
    When I edit supplier "ACME Corp" setting company name to "ACME Corporation"
    Then the request should succeed
    And supplier "ACME Corporation" should exist
    And the "suppliers" history should show an "update" entry for "ACME Corporation"

  Scenario: An admin can delete a supplier and the deletion is recorded in its history
    Given a supplier "Old Supplier Co" exists
    When I delete that supplier
    Then the request should succeed
    And supplier "Old Supplier Co" should not exist
    And the "suppliers" history should show a "delete" entry for "Old Supplier Co"

  Scenario: A project with BOQ items attached cannot be deleted from Manage Data
    Given a project "PRJ1" already exists with a BOQ item "Cement" material cost 45000 labor cost 12000
    When I try to delete project "PRJ1" from Manage Data
    Then the request should fail with an error matching "BOQ items"
    And project "PRJ1" should exist

  Scenario: A project with no attached data can be deleted from Manage Data
    Given a project "STUCK PROJECT" already exists
    When I try to delete project "STUCK PROJECT" from Manage Data
    Then the request should succeed
    And project "STUCK PROJECT" should not exist

  Scenario: A mistaken delivery entry can now be corrected and deleted
    Given a delivery record exists for PO "PO-1" item "Cement" quantity 10
    When I correct that delivery's quantity to 8
    Then the request should succeed
    And that delivery's quantity should be 8

    When I delete that delivery record
    Then the request should succeed
    And that delivery record should no longer exist

  Scenario: A mistaken petty cash / reimbursement entry can now be corrected and deleted
    Given a reimbursement record exists for project "PRJ1" amount 500
    When I correct that reimbursement's amount to 450
    Then the request should succeed
    And that reimbursement's amount should be 450

    When I delete that reimbursement record
    Then the request should succeed
    And that reimbursement record should no longer exist

  Scenario: History for one data type never leaks into another type's history
    Given a supplier "ACME Corp" exists
    And a delivery record exists for PO "PO-1" item "Cement" quantity 10
    When I delete that supplier
    And I delete that delivery record
    Then the "suppliers" history should show exactly 1 entry
    And the "deliveries" history should show exactly 1 entry
