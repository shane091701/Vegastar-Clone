# Cucumber (Ruby) Setup Guide — vegastar-erp

**Status: already installed and working in this repo** (`features/mrf_to_delivery.feature`
+ `features/step_definitions/mrf_to_delivery_steps.rb`, 12 scenarios / 113 steps,
all green as of 2026-07-13). This doc explains what was set up and why, so you
can extend it or redo it elsewhere.

This app is a **Rails 8.1.3 / Ruby 3.3.11** JSON API (no server-rendered views —
it's an RPC-style API: every endpoint is `POST /api/<action>` with a body of
`{ "args": [...] }`). It uses **Minitest** (Rails default), not RSpec.

Cucumber runs the *same way* the existing `test/controllers/api/*_test.rb`
Minitest suite does — plain `post "/api/<action>", params: { args: [...] }, as: :json`
followed by reading `response` — because `Cucumber::Rails::World` already
inherits from `ActionDispatch::IntegrationTest`. No Capybara/browser driver is
needed or used; `capybara`/`selenium-webdriver` remain in the Gemfile only for
Rails' own (unused) system-test scaffolding.

---

## 1. Gems (already in `Gemfile`, `group :test`)

```ruby
group :test do
  gem "capybara"
  gem "selenium-webdriver"

  # Cucumber for Gherkin-style feature tests against the JSON API
  gem "cucumber-rails", require: false
  gem "database_cleaner-active_record"
end
```

```bash
bundle install
```

## 2. Generate scaffolding

```bash
bin/rails generate cucumber:install
```

Creates `config/cucumber.yml`, `bin/cucumber`, `features/support/env.rb`,
`features/step_definitions/`, and a `cucumber` Rake task.

## 3. Prepare the test database

```bash
RAILS_ENV=test bin/rails db:prepare
```

## 4. Two non-obvious fixes required in `features/support/env.rb`

The generator's default `env.rb` does **not** work out of the box for an
integration-test-style API suite. Two things had to be added at the top,
before `require 'cucumber/rails'`:

**a) `cucumber-rails` shadows `post`/`response` by default.** It includes
`Rack::Test::Methods` into `World` unless told not to — that module defines
its *own* `post`/`response` methods, which shadow the ones
`ActionDispatch::IntegrationTest` already gives you, and its `post` talks to a
plain Rack::Test session instead of the real Rails integration session. The
symptom: `response` comes back `nil` after every `post` call. Fix:

```ruby
ENV['CR_REMOVE_RACK_TEST_HELPERS'] = 'true'
require 'cucumber/rails'
```

**b) `minitest/mock` (needed for `SomeClass.stub`) isn't auto-loaded for
Cucumber.** `test/test_helper.rb` requires it (with a hand-rolled fallback if
it's missing) for the Minitest suite, but Cucumber's `env.rb` never loads
`test_helper.rb`. Several step definitions need to stub `PdfGenerator.store` /
`PdfGenerator.render_pdf` (see §6) — real PDF generation shells out to a local
Chromium browser via `ferrum`, which isn't guaranteed to be installed
everywhere the suite runs. Add the same require/fallback used in
`test_helper.rb` to `env.rb`:

```ruby
begin
  require 'minitest/mock'
rescue LoadError
  class Object
    def stub(name, val_or_callable, *block_args, **block_kwargs)
      new_name = "__stubbed__#{name}"
      metaclass = class << self; self; end
      metaclass.send :alias_method, new_name, name
      metaclass.send :define_method, name do |*args, **kwargs, &blk|
        if val_or_callable.respond_to?(:call)
          val_or_callable.call(*args, **kwargs, &blk)
        else
          blk&.call(*block_args, **block_kwargs)
          val_or_callable
        end
      end
      yield self
    ensure
      metaclass.send :undef_method, name
      metaclass.send :alias_method, name, new_name
      metaclass.send :undef_method, new_name
    end
  end
end
```

The rest of the generated `env.rb` (DatabaseCleaner `:transaction` strategy,
`ActionController::Base.allow_rescue = false`) is used as-is.

`config/cucumber.yml` also has `--publish-quiet` added to the default profile
to suppress the cucumber.io publish prompt on every run.

## 5. Directory layout

```
features/
  mrf_to_delivery.feature
  step_definitions/
    mrf_to_delivery_steps.rb
  support/
    env.rb
config/
  cucumber.yml
```

## 6. Step definition conventions used here

Reuse the same request-shape pattern as
`test/controllers/api/mrf_controller_test.rb`'s `api(fn, *args)` helper:

```ruby
def api_post(fn, *fn_args)
  post "/api/#{fn}", params: { args: fn_args }, as: :json
  if response.successful?
    @last_result = response.body == "null" ? nil : JSON.parse(response.body)
    @last_error = nil
  else
    @last_result = nil
    @last_error = (JSON.parse(response.body)["error"] rescue response.body)
  end
  @last_result
end
```

Notes:
- **No `expect(...).to eq(...)`.** This app has no `rspec-expectations` gem —
  step definitions use plain Ruby (`raise "..." unless ...`).
- **Stub PDF generation.** `CanvasAwarder` (via `awardCanvasWinners`) and
  `dispatch_alpha_po` both generate real PDFs unconditionally (no
  `PdfGenerator.available?` guard). Step definitions wrap those calls in
  `PdfGenerator.stub(:store, "/pdf/stub.pdf") { ... }` /
  `PdfGenerator.stub(:render_pdf, "%PDF-FAKE-BYTES%") { ... }`, exactly like
  `test/controllers/api/canvas_controller_test.rb` already does.
- **Argument shapes** for each endpoint match the controller's `arg(n)`/`args[n]`
  reads exactly — see `app/controllers/api/mrf_controller.rb`,
  `canvas_controller.rb`, `purchase_orders_controller.rb`, and
  `receiving_controller.rb`.

## 7. Run it

```bash
bundle exec cucumber                              # everything
bundle exec cucumber features/mrf_to_delivery.feature   # one file
```

## 8. What's covered (`features/mrf_to_delivery.feature`)

12 scenarios spanning the full MRF → Delivery flow plus every guardrail found
while reading the controllers:

- Full happy path: submit → approve → quote → award → dispatch → partial
  delivery → full delivery
- Reject an MRF (ledger entry removed)
- Submitting an MRF with no valid items is rejected
- Void an approved RFQ (before any PO exists) restores the budget
- Voiding an RFQ is blocked once a PO already exists for it
- Awarding creates one Draft PO per winning supplier
- Dispatch is blocked when the supplier has no email on file
- An already-dispatched PO can't be dispatched again
- Voiding a Draft PO returns its items to the canvassing pool
- A PO can't be voided once delivery has started
- Returnable tool requests (separate track — no PO/delivery involved),
  both approve and reject paths

See `VEGASTAR_ERP_MANUAL_FLOW.md` for the manual/business-flow explanation
these scenarios are based on.

## 9. Bug found and fixed while writing these tests

`void_alpha_po` (`app/controllers/api/purchase_orders_controller.rb`) checks
`PurchaseOrderItem.status` — a raw DB column — to decide whether a PO already
has real-world deliveries and should be locked from voiding. But
`"Partial delivery"`/`"Received all"` are **never persisted** on that column —
they only ever exist as the return value of `PoStatusCalculator.call`, computed
on read. That means the guardrail could never actually fire: a PO could be
voided even after deliveries had been recorded against it, silently
orphaning those `Delivery` rows. Fixed to check
`PoStatusCalculator.call(po_code)` instead of the raw column. Covered by the
"A purchase order cannot be voided once delivery has started" scenario, which
failed against the original code and passes against the fix.

## 10. Hook into CI

`cucumber-rails` adds a `cucumber` Rake task and appends it to `rake` (the
default task). Run Minitest and Cucumber independently in CI:

```bash
bin/rails test
bundle exec cucumber
```
