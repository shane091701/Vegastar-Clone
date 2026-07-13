Feature: Petty Cash / Reimbursement submission
  As a site staff member
  I want to submit a petty cash reimbursement with a receipt
  So that I get paid back and it shows up on the project's ledger

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | admin@test.local     | Admin    | admin     | Secret123!  |
    And I am logged in as "admin@test.local"

  Scenario: Submitting a petty cash record with a receipt appears on the ledger
    When I submit a petty cash record for project "PRJ1" type "Fuel" particulars "Gasoline for site visit" amount 850 with a receipt photo
    Then the request should succeed
    And the petty cash ledger for project "PRJ1" should include a "Fuel" entry for "Gasoline for site visit" amount 850

  Scenario: Submitting a petty cash record without a receipt is rejected
    When I submit a petty cash record for project "PRJ1" type "Fuel" particulars "Gasoline" amount 500 with no receipt photo
    Then the request should fail with an error matching "receipt"
