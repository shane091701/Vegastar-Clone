Feature: BOQ Upload lifecycle and manual adjustments
  As a project engineer
  I want to upload a project's Bill of Quantities and correct it afterward
  So that budgets are set up correctly and can be fixed without starting over

  Background:
    Given the following users exist:
      | email                | name     | role      | password    |
      | admin@test.local     | Admin    | admin     | Secret123!  |
    And I am logged in as "admin@test.local"

  Scenario: Uploading a valid BOQ workbook creates the project and its items
    When I upload a BOQ workbook for project "PRJ UPLOAD" with items:
      | phase        | item             | qty | unit  |
      | CIVIL WORKS  | Concrete 4000psi | 10  | cu.m  |
    Then the request should succeed
    And project "PRJ UPLOAD" should exist
    And a BOQ item "Concrete 4000psi" should exist for project "PRJ UPLOAD"

  Scenario: A project code with symbols is rejected before anything is saved
    When I upload a BOQ workbook for project "BAD-CODE!" with items:
      | phase | item   | qty | unit |
      | Civil | Cement | 10  | bags |
    Then the upload result should mention "may contain only letters, numbers, and spaces"
    And project "BAD-CODE!" should not exist

  Scenario: Uploading to an already-used project code is rejected
    Given a project "DUPE PROJECT" already exists
    When I upload a BOQ workbook for project "DUPE PROJECT" with items:
      | phase | item   | qty | unit |
      | Civil | Cement | 10  | bags |
    Then the upload result should mention "was already used"

  Scenario: A workbook that fails to parse does not leave a stuck project behind
    When I upload a broken (unparseable) BOQ workbook for project "PRJ BROKEN"
    Then the upload result should mention "Error in processBOQ"
    And project "PRJ BROKEN" should not exist

  Scenario: A workbook with no item rows does not leave a stuck project behind
    When I upload an empty BOQ workbook (header only, no items) for project "PRJ EMPTY UP"
    Then the upload result should mention "No valid item rows found"
    And project "PRJ EMPTY UP" should not exist

  Scenario: Admin can manually add a BOQ item with a reason
    Given a project "PRJ MANUAL" already exists
    When I add a BOQ item to project "PRJ MANUAL" phase "Electrical" named "Panel Board" quantity 2 unit "pcs" material cost 20000 labor cost 5000 reason "Missed in original upload"
    Then the request should succeed
    And a BOQ item "Panel Board" should exist for project "PRJ MANUAL"

  Scenario: Admin can adjust an existing BOQ item's costs
    Given a project "PRJ ADJUST" already exists with a BOQ item "Cement" material cost 45000 labor cost 12000
    When I adjust that BOQ item to material cost 40000 labor cost 10000 reason "Value engineering"
    Then the request should succeed
    And the BOQ item "Cement" for project "PRJ ADJUST" should have material cost 40000 and labor cost 10000
