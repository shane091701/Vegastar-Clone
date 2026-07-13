Feature: Canvassing/Bidding and Purchase Order dispatch
  As a procurement officer
  I want to collect supplier quotes, award the best one, and track purchase orders
  So that materials get ordered from the right supplier at the right price, with
  accurate status and payment tracking throughout

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | approver@test.local  | Approver | approver  | Secret123!  |
    And a BOQ budget exists for project "PRJ1" phase "Civil" item "Cement" with quantity 200 uom "bags", material cost 50000, labor cost 10000
    And a supplier "Holcim Depot" exists with email "sales@holcim.test"
    And I am logged in as "approver@test.local"

  Scenario: Pending quote MRFs list an approved item until it's awarded
    Given an MRF has been submitted and approved for "Cement" quantity 50
    Then the pending quote MRFs should include "Cement"

    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 2500 brand "Holcim"
    And I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 50  | 2500   |
    Then the pending quote MRFs should not include "Cement"

  Scenario: Canvas pivot data shows every supplier's quote and the correct remaining budget
    Given an MRF has been submitted and approved for "Cement" quantity 50
    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 4000 brand "Holcim"
    And I save a supplier quote from "ACME Supply" for item "Cement" amount 3800 brand "Generic"
    And I fetch the canvas pivot data for the MRF
    Then the request should succeed
    And the canvas pivot should list suppliers "Holcim Depot" and "ACME Supply"
    And the canvas pivot item "Cement" should have remaining cost 60200.0

  Scenario: Awarding a supplier back-calculates the unit price from the quoted subtotal
    Given an MRF has been submitted and approved for "Cement" quantity 50
    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 4000 brand "Holcim"
    And I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 8   | 4000   |
    Then the request should succeed
    And the purchase order item "Cement" should have unit price 500.0
    And the purchase order item "Cement" should have quantity 8.0

  Scenario: A Lot-unit item with zero quantity is awarded as quantity 1
    Given an MRF has been submitted and approved for "Panel Board" quantity 1
    When I award the canvas to:
      | supplier     | item        | qty | amount |
      | Holcim Depot | Panel Board | 0   | 1500   |
    Then the request should succeed
    And the purchase order item "Panel Board" should have quantity 1.0
    And the purchase order item "Panel Board" should have unit price 1500.0

  Scenario: Awarding multiple different suppliers in one call creates one purchase order per supplier
    Given an MRF has been submitted and approved for "Cement" quantity 50
    And another item "Rebar" quantity 5 has also been approved under the same MRF
    When I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 50  | 4000   |
      | ACME Supply  | Rebar  | 5   | 1500   |
    Then the request should succeed
    And a purchase order should exist for supplier "Holcim Depot" with status "Draft"
    And a purchase order should exist for supplier "ACME Supply" with status "Draft"
    And the purchase order item "Cement" should have unit price 80.0
    And the purchase order item "Rebar" should have unit price 300.0

  Scenario: Canvas MRF list reflects whether a purchase order already exists
    Given an MRF has been submitted and approved for "Cement" quantity 50
    When I save a supplier quote from "Holcim Depot" for item "Cement" amount 2500 brand "Holcim"
    Then the canvas MRF list should show "hasPo" as false for the MRF

    When I award the canvas to:
      | supplier     | item   | qty | amount |
      | Holcim Depot | Cement | 50  | 2500   |
    Then the canvas MRF list should show "hasPo" as true for the MRF

  Scenario: Purchase order payment status reflects issued payments
    Given an MRF has been submitted, approved, dispatched to "Holcim Depot" for "Cement" quantity 50 amount 5000
    Then the purchase order in getPurchaseOrders should show total 5000.0
    And the purchase order in getPurchaseOrders should show payment status "Not Yet Paid"

    Given a payment of 2000 has been issued against the purchase order
    Then the purchase order in getPurchaseOrders should show payment status "Partially Paid"

    Given a payment of 3000 has been issued against the purchase order
    Then the purchase order in getPurchaseOrders should show payment status "Fully Paid"
