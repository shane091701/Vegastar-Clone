Feature: MRF to Delivery flow
  As a project team member
  I want to request materials, get them approved, canvassed, ordered, and delivered
  So that the project receives what it needs and every status change (and every
  guardrail that blocks an invalid action) works exactly as the business expects

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | approver@test.local  | Approver | approver  | Secret123!  |
    And a BOQ budget exists for project "PRJ1" phase "Civil" item "Cement" with quantity 200 uom "bags", material cost 50000, labor cost 10000
    And a supplier "Holcim Depot" exists with email "sales@holcim.test"
    And I am logged in as "approver@test.local"

  Scenario: Full happy path from MRF submission through full delivery
    When I submit an MRF request for project "PRJ1" phase "Civil" item "Cement" unit "bags" quantity 100 with remarks "For foundation pour"
    Then the request should succeed
    And the MRF item "Cement" should have status "Pending"

    When I approve the MRF request with quantity 100 and brand "Holcim"
    Then the request should succeed
    And the MRF item "Cement" should have status "Approved"
    And the MRF item "Cement" should have an RFQ PDF generated

    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 5000 brand "Holcim"
    Then the request should succeed

    When I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 100 | 5000   |
    Then the request should succeed
    And a purchase order should exist for "Holcim Depot" with status "Draft"

    When I dispatch the purchase order
    Then the request should succeed
    And the purchase order status should be "Sent"

    When I record a delivery of 60 units of "Cement" against the purchase order
    Then the request should succeed
    And the purchase order status should be "Partial delivery"
    And 40 units of "Cement" should remain to be received on the purchase order

    When I record a delivery of 40 units of "Cement" against the purchase order
    Then the request should succeed
    And the purchase order status should be "Received all"
    And the purchase order should no longer appear in the receiving queue

  Scenario: Rejecting an MRF stops the flow and returns the reserved budget
    When I submit an MRF request for project "PRJ1" phase "Civil" item "Cement" unit "bags" quantity 50
    When I reject the MRF request
    Then the MRF item "Cement" should have status "Rejected"
    And there should be no out ledger entries

  Scenario: Submitting an MRF with no valid items is rejected
    When I submit an MRF request with an empty item list
    Then the request should fail with an error matching "No items valid"

  Scenario: Voiding an approved RFQ before a PO exists restores the budget
    When I submit an MRF request for project "PRJ1" phase "Civil" item "Cement" unit "bags" quantity 50
    And I approve the MRF request with quantity 50 and brand "Holcim"
    And I void the RFQ with reason "duplicate request"
    Then the request should succeed
    And the MRF item "Cement" should have status "Voided"
    And there should be no out ledger entries

  Scenario: Voiding an RFQ is blocked once a purchase order already exists for it
    Given an MRF has been submitted, approved, and awarded to "Holcim Depot" for "Cement" quantity 50 amount 2500
    When I void the RFQ with reason "duplicate request"
    Then the request should fail with an error matching "Please void the PO first"

  Scenario: Awarding the canvas creates one Draft purchase order per winning supplier
    Given an MRF has been submitted and approved for "Cement" quantity 50
    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 2500 brand "Holcim"
    And I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 50  | 2500   |
    Then a purchase order should exist for "Holcim Depot" with status "Draft"

  Scenario: Dispatch is blocked when the supplier has no email on file
    Given an MRF has been submitted, approved, and awarded to "Unknown Supplier" for "Cement" quantity 50 amount 2500
    When I dispatch the purchase order
    Then the request should fail with an error matching "No email found for supplier"

  Scenario: An already-dispatched purchase order cannot be dispatched a second time
    Given an MRF has been submitted, approved, dispatched to "Holcim Depot" for "Cement" quantity 50 amount 2500
    When I dispatch the purchase order
    Then the request should fail with an error matching "already been dispatched"

  Scenario: Voiding a Draft purchase order returns its items to the canvassing pool
    Given an MRF has been submitted, approved, and awarded to "Holcim Depot" for "Cement" quantity 50 amount 2500
    When I void the purchase order with reason "wrong supplier chosen"
    Then the request should succeed
    And the purchase order status should be "Voided"
    And the MRF item "Cement" should be available for canvassing again

  Scenario: A purchase order cannot be voided once delivery has started
    Given an MRF has been submitted, approved, dispatched to "Holcim Depot" for "Cement" quantity 50 amount 2500
    And I record a delivery of 10 units of "Cement" against the purchase order
    When I void the purchase order with reason "changed my mind"
    Then the request should fail with an error matching "already arrived on site"

  Scenario: Returnable tool requests skip the purchase order and delivery flow entirely
    When I submit a returnable request for project "PRJ1" item "Scaffolding" quantity 4
    Then the returnable item "Scaffolding" should have status "Pending"

    When I approve the returnable request with quantity 3
    Then the returnable item "Scaffolding" should have status "Approved"
    And no purchase order should have been created for "Scaffolding"

  Scenario: A returnable tool request can be rejected
    When I submit a returnable request for project "PRJ1" item "Scaffolding" quantity 4
    And I reject the returnable request
    Then the returnable item "Scaffolding" should have status "Rejected"
