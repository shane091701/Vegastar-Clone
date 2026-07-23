Feature: Subcontractors and Work Packages
  As a project admin
  I want to register subcontractors, assign work packages against BOQ budget,
  track their progress, and pay them via linked checks
  So that subcontractor costs stay tied to real budget and payment status is always accurate

  Background:
    Given the following users exist:
      | email             | name  | role  | password    |
      | admin@test.local  | Admin | admin | Secret123!  |
    And I am logged in as "admin@test.local"

  Scenario: Registering a new subcontractor
    When I register a subcontractor named "BuildRight Corp" TIN "123-456" contact "0917-000-0000"
    Then the request should succeed
    And subcontractor "BuildRight Corp" should exist and be active

  Scenario: Registering a subcontractor with a duplicate name (case-insensitive) is rejected
    Given a subcontractor "BuildRight Corp" is registered
    When I register a subcontractor named "buildright corp" TIN "" contact ""
    Then the request should fail with an error matching "already exists"

  Scenario: A subcontractor can be deactivated and reactivated
    Given a subcontractor "BuildRight Corp" is registered
    When I toggle that subcontractor's active status
    Then the request should succeed
    And subcontractor "BuildRight Corp" should exist and be inactive

    When I toggle that subcontractor's active status
    Then subcontractor "BuildRight Corp" should exist and be active

  Scenario: Assigning a work package prorates BOQ line costs and creates milestones matching the contract value
    Given a subcontractor "BuildRight Corp" is registered
    When I start a new work package for "BuildRight Corp" on project "PRJ1" labeled "Masonry Works" basis "labor" contract value 10000
    And with BOQ lines:
      | phase | scope | item   | laborCost | materialCost | totalCost |
      | Civil | 1.1   | Wall A | 3000      | 100          | 3100      |
      | Civil | 1.1   | Wall B | 1000      | 200          | 1200      |
    And with milestones:
      | seq | label        | targetPct | paymentPct |
      | 1   | Mobilization | 25        | 40         |
      | 2   | Completion   | 100       | 60         |
    And I submit the work package
    Then the request should succeed
    And the work package should appear for project "PRJ1"
    And BOQ line "Wall A" for that work package should have an allocated cost of 7500
    And milestone 1 for that work package should have amount 4000
    And milestone 2 for that work package should have amount 6000

  Scenario: A BOQ line already claimed by another work package cannot be reassigned
    Given a work package exists for "BuildRight Corp" on project "PRJ1" contract value 10000 with a single line "Wall A" labor cost 3000
    When I start a new work package for "BuildRight Corp" on project "PRJ1" labeled "Dup" basis "labor" contract value 500
    And with BOQ lines:
      | phase | scope | item   | laborCost | materialCost | totalCost |
      | Civil | 1.1   | Wall A | 3000      | 0            | 3000      |
    And with milestones:
      | seq | label | targetPct | paymentPct |
      | 1   | All   | 100       | 100        |
    And I submit the work package
    Then the request should fail with an error matching "already assigned"

  Scenario: Milestone payment percentages must sum to exactly 100
    Given a subcontractor "BuildRight Corp" is registered
    When I start a new work package for "BuildRight Corp" on project "PRJ2" labeled "Bad" basis "labor" contract value 500
    And with BOQ lines:
      | phase | scope | item | laborCost | materialCost | totalCost |
      | P     | S     | I    | 100       | 0             | 100       |
    And with milestones:
      | seq | label | targetPct | paymentPct |
      | 1   | Half  | 50        | 50         |
    And I submit the work package
    Then the request should fail with an error matching "must sum to exactly 100"

  Scenario: A downpayment milestone can have a target of 0 percent, payable before any progress is reported
    Given a subcontractor "BuildRight Corp" is registered
    When I start a new work package for "BuildRight Corp" on project "PRJ1" labeled "Masonry Works" basis "labor" contract value 10000
    And with BOQ lines:
      | phase | scope | item   | laborCost | materialCost | totalCost |
      | Civil | 1.1   | Wall A | 3000      | 100           | 3100      |
    And with milestones:
      | seq | label       | targetPct | paymentPct |
      | 1   | Downpayment | 0         | 20         |
      | 2   | Completion  | 100       | 80         |
    And I submit the work package
    Then the request should succeed
    And milestone 1 for that work package should have amount 2000

  Scenario: A milestone target percentage cannot be negative
    Given a subcontractor "BuildRight Corp" is registered
    When I start a new work package for "BuildRight Corp" on project "PRJ2" labeled "Bad" basis "labor" contract value 500
    And with BOQ lines:
      | phase | scope | item | laborCost | materialCost | totalCost |
      | P     | S     | I    | 100       | 0             | 100       |
    And with milestones:
      | seq | label   | targetPct | paymentPct |
      | 1   | Invalid | -5        | 100        |
    And I submit the work package
    Then the request should fail with an error matching "Target %"

  Scenario: Submitting a progress report auto-flags milestones whose target has been met
    Given a work package exists for "BuildRight Corp" on project "PRJ1" contract value 10000 with a single line "Wall A" labor cost 3000
    When I submit a progress report for that work package at 30 percent complete with narrative "Blocks laid"
    Then the request should succeed
    And milestone 1 for that work package should be ready to pay
    And milestone 2 for that work package should not be ready to pay

  Scenario: A milestone can be manually marked ready to pay, and marking it again is blocked
    Given a work package exists for "BuildRight Corp" on project "PRJ1" contract value 10000 with a single line "Wall A" labor cost 3000
    When I manually mark milestone 1 for that work package as ready to pay
    Then the request should succeed
    And milestone 1 for that work package should be ready to pay

    When I manually mark milestone 1 for that work package as ready to pay
    Then the request should fail with an error matching "already marked Ready to Pay"

  Scenario: Linking a check marks a milestone Paid; voiding the check reverts it; unlinking clears it
    Given a work package exists for "BuildRight Corp" on project "PRJ1" contract value 10000 with a single line "Wall A" labor cost 3000
    And I submit a progress report for that work package at 30 percent complete with narrative "x"
    And a check "CHK-100" exists for project "BuildRight advance" bank "BDO" amount 4000
    When I link check "CHK-100" to milestone 1 for that work package
    Then the request should succeed
    And the AP status for milestone 1 of that work package should be "Paid"

    When that check is voided
    Then the AP status for milestone 1 of that work package should be "Ready to Pay" noting "voided"

    When I unlink the check from milestone 1 for that work package
    Then the request should succeed
    And milestone 1 for that work package should have no check linked

  Scenario: Budget vs actual and payables views reflect real computed totals
    Given a work package exists for "BuildRight Corp" on project "PRJ1" contract value 10000 with a single line "Wall A" labor cost 4000
    And I manually mark milestone 1 for that work package as ready to pay
    Then the payables list should include milestone 1 of that work package
    And the budget view for project "PRJ1" should show BOQ budget 4000, contract value 10000, and variance -6000
