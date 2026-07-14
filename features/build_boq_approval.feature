Feature: Build BOQ (native builder) submission and approval
  As a project engineer
  I want to build and submit a BOQ from scratch and have an admin approve it
  So that the project gets its official budget without needing an Excel upload

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | admin@test.local     | Admin    | admin     | Secret123!  |
    And I am logged in as "admin@test.local"

  Scenario: Submitting a native BOQ for approval succeeds and appears in pending approvals
    When I submit a native BOQ for approval for project "NB PROJ" customer "Juan Dela Cruz" company "SP Bedana" with items:
      | phase | scope      | name     | unit | qty | laborCost | materialCost |
      | Civil | Foundation | Concrete | cu.m | 10  | 100       | 400          |
    Then the request should succeed
    And that BOQ submission should appear in pending approvals for project "NB PROJ"

  Scenario: The pending approvals grand total is computed correctly from item costs
    When I submit a native BOQ for approval for project "NB CALC" customer "Juan" company "SP Bedana" with items:
      | phase | scope      | name     | unit | qty | laborCost | materialCost |
      | Civil | Foundation | Concrete | cu.m | 10  | 100       | 400          |
      | Civil | Foundation | Rebar    | pcs  | 2   | 50        | 150          |
    Then the pending approval grand total for project "NB CALC" should be 5400.0

  Scenario: Submitting to an already-used project code is rejected
    Given a project "DUPE NATIVE" already exists
    When I submit a native BOQ for approval for project "DUPE NATIVE" customer "Juan" company "SP Bedana" with items:
      | phase | scope | name   | unit | qty | laborCost | materialCost |
      | Civil | Gen   | Cement | bags | 10  | 50        | 100          |
    Then the request should fail with an error matching "was already used"

  Scenario: Submitting with an invalid project code is rejected
    When I submit a native BOQ for approval for project "BAD-CODE!" customer "Juan" company "SP Bedana" with items:
      | phase | scope | name   | unit | qty | laborCost | materialCost |
      | Civil | Gen   | Cement | bags | 10  | 50        | 100          |
    Then the request should fail with an error matching "may contain only letters, numbers, and spaces"

  Scenario: Admin approves a submission, writing BOQ items and generating a PDF
    Given a native BOQ has been submitted for project "NB APPROVE"
    When I approve that BOQ submission
    Then the request should succeed
    And that BOQ submission should have status "Approved" for submitter "admin@test.local"
    And project "NB APPROVE" should exist
    And a BOQ item "Concrete" should exist for project "NB APPROVE"
    And that BOQ submission should no longer appear in pending approvals

  Scenario: Admin rejects a submission
    Given a native BOQ has been submitted for project "NB REJECT"
    When I reject that BOQ submission
    Then the request should succeed
    And that BOQ submission should have status "Rejected" for submitter "admin@test.local"

  Scenario: Returning a submission requires remarks
    Given a native BOQ has been submitted for project "NB RETURN"
    When I return that BOQ submission with no remarks
    Then the request should fail with an error matching "Remarks are required"

  Scenario: Admin returns a submission with remarks, and it can be marked resubmitted
    Given a native BOQ has been submitted for project "NB RETURN2"
    When I return that BOQ submission with remarks "Please fix pricing"
    Then the request should succeed
    And that BOQ submission should have status "Returned" for submitter "admin@test.local"
    And that BOQ submission's remarks should be "Please fix pricing"

    When I mark that BOQ submission as resubmitted
    Then that BOQ submission should have status "Resubmitted" for submitter "admin@test.local"

  Scenario: An already-processed submission cannot be processed again
    Given a native BOQ has been submitted for project "NB DOUBLE"
    When I reject that BOQ submission
    And I approve that BOQ submission
    Then the request should fail with an error matching "already been processed"
