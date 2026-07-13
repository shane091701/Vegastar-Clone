Feature: Payments, Checks, and RTB / Collections lifecycle
  As an accounting team member and project engineer
  I want to log payments, track checks, and request/approve/collect billing
  So that project cash flow is recorded accurately

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | admin@test.local     | Admin    | admin     | Secret123!  |
    And a supplier "Holcim Depot" exists with email "sales@holcim.test"
    And I am logged in as "admin@test.local"

  Scenario: Logging bulk check payments creates the correct records
    When I log bulk check payments:
      | project | date       | bank | checkNum | amount |
      | PRJ1    | 2026-08-01 | BDO  | CHK-1001 | 15000  |
      | PRJ1    | 2026-09-01 | BDO  | CHK-1002 | 15000  |
    Then the request should succeed
    And 2 Check records should exist for project "PRJ1"
    And a Check "CHK-1001" should have amount 15000 and status "Not Deposited"

  Scenario: A pending check can be marked as deposited
    Given a check "CHK-2001" exists for project "PRJ1" amount 20000
    When I mark check "CHK-2001" as "Deposited"
    Then the request should succeed
    And check "CHK-2001" should have status "Deposited"

  Scenario: The pending checks list excludes checks once deposited
    Given a check "CHK-3001" exists for project "PRJ1" amount 5000
    When I mark check "CHK-3001" as "Deposited"
    Then the pending checks list should not include "CHK-3001"

  Scenario: Issue payments correctly compute the purchase order's payment status
    Given an MRF has been submitted, approved, dispatched to "Holcim Depot" for "Cement" quantity 50 amount 5000
    Then the purchase order's payment status should be "Not Yet Paid"

    When I save an issue payment of 2500 for that purchase order term "50% Downpayment"
    Then the request should succeed
    And the purchase order's payment status should be "Partially Paid"

    When I save an issue payment of 2500 for that purchase order term "Balance"
    Then the request should succeed
    And the purchase order's payment status should be "Fully Paid"

  Scenario: Submitting project progress is retrievable afterward
    Given a project "PRJ1" already exists
    When I submit project progress for "PRJ1" overall percent 45
    Then the request should succeed
    And the latest project progress for "PRJ1" should be 45 percent

  Scenario: An RTB request requires the project to have a Quoted Cost set
    Given a project "PRJ NOQC" already exists
    When I submit an RTB request for project "PRJ NOQC" percent to bill 20
    Then the request should fail with an error matching "No Quoted Cost found"

  Scenario: A valid RTB request computes the correct amount to bill
    Given a project "PRJ QC" already exists with quoted cost 100000
    When I submit an RTB request for project "PRJ QC" percent to bill 20
    Then the request should succeed
    And the pending RTBs list should include project "PRJ QC" with amount to bill 20000

  Scenario: RTB percent to bill must be between 1 and 100
    Given a project "PRJ QC2" already exists with quoted cost 100000
    When I submit an RTB request for project "PRJ QC2" percent to bill 0
    Then the request should fail with an error matching "% to Bill must be between 1 and 100"
    When I submit an RTB request for project "PRJ QC2" percent to bill 150
    Then the request should fail with an error matching "% to Bill must be between 1 and 100"

  Scenario: Admin can approve a pending RTB
    Given a project "PRJ QC3" already exists with quoted cost 100000
    And an RTB request has been submitted for project "PRJ QC3" percent to bill 30
    When I approve that RTB
    Then the request should succeed
    And the pending RTBs list should not include project "PRJ QC3"

  Scenario: Admin can reject a pending RTB
    Given a project "PRJ QC4" already exists with quoted cost 100000
    And an RTB request has been submitted for project "PRJ QC4" percent to bill 30
    When I reject that RTB
    Then the request should succeed
    And that RTB's status should be "Rejected"

  Scenario: An already-processed RTB cannot be processed again
    Given a project "PRJ QC5" already exists with quoted cost 100000
    And an RTB request has been submitted for project "PRJ QC5" percent to bill 30
    And I approve that RTB
    When I approve that RTB
    Then the request should fail with an error matching "already been processed"

  Scenario: An approved RTB disappears from Approved RTBs once collected
    Given a project "PRJ QC6" already exists with quoted cost 100000
    And an RTB request has been submitted for project "PRJ QC6" percent to bill 40
    And I approve that RTB
    Then the approved RTBs list should include project "PRJ QC6"

    When I submit a collection for that RTB amount 40000 bank "BDO" due date "2026-09-01" check number "CHK-9001"
    Then the request should succeed
    And the approved RTBs list should not include project "PRJ QC6"
