require "test_helper"

class PdfGeneratorTest < ActiveSupport::TestCase
  test "render_pdf produces real PDF bytes, not the raw HTML source" do
    skip "no Chromium-based browser available in this environment" unless PdfGenerator.available?

    html = "<!DOCTYPE html><html><body><h1>Test Document</h1></body></html>"
    data = PdfGenerator.render_pdf(html)

    assert_equal "%PDF-", data.byteslice(0, 5),
      "expected real PDF bytes (a data: URI navigation failure can instead print the raw markup as text)"
    refute data.include?("<html>"),
      "the rendered PDF must not contain the literal source markup"
  end
end
